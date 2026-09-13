import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Temporal } from '@js-temporal/polyfill';
import { db } from '../prisma/db.js';
import type {
  AdminBookingItem,
  AdminSafeUser,
  AnalyticsResult,
  BookingCountsByStatus,
  DailyAnalytics,
  PaginatedResult,
} from './admin.types.js';
import {
  activateUserRecord,
  banUserRecord,
  isUserActive,
  isUserBanned,
  isUserVerified,
  unbanUserRecord,
  verifyUserRecord,
} from './ban.store.js';

@Injectable()
export class AdminService {
  async listUsers(query: {
    q?: string;
    role?: string;
    isBanned?: boolean;
    isActive?: boolean;
    isVerified?: boolean;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<AdminSafeUser>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    let userQuery = db.orm.public.User as any;

    if (query.role) {
      userQuery = userQuery.where({ role: query.role });
    }

    if (query.q) {
      const pattern = `%${query.q}%`;
      userQuery = userQuery.where((u: any) => u.name.ilike(pattern));
    }

    let allMatching: any[] = await userQuery.all();

    if (query.q && typeof (userQuery as any).where !== 'function') {
      const search = query.q.toLowerCase();
      allMatching = allMatching.filter(
        (user: any) =>
          user.name.toLowerCase().includes(search) ||
          user.email.toLowerCase().includes(search),
      );
    }

    if (query.isBanned !== undefined) {
      allMatching = allMatching.filter((u: any) => isUserBanned(u.id) === query.isBanned);
    }

    if (query.isActive !== undefined) {
      allMatching = allMatching.filter((u: any) => isUserActive(u.id) === query.isActive);
    }

    if (query.isVerified !== undefined) {
      allMatching = allMatching.filter((u: any) => isUserVerified(u.id) === query.isVerified);
    }

    allMatching.sort((a: any, b: any) => {
      const aTime = typeof a.createdAt === 'object' && a.createdAt !== null && 'epochMilliseconds' in a.createdAt
        ? (a.createdAt as Temporal.Instant).epochMilliseconds
        : 0;
      const bTime = typeof b.createdAt === 'object' && b.createdAt !== null && 'epochMilliseconds' in b.createdAt
        ? (b.createdAt as Temporal.Instant).epochMilliseconds
        : 0;
      return bTime - aTime;
    });

    const total = allMatching.length;
    const items = allMatching.slice(offset, offset + limit).map((user: any) => this.toSafeUser(user));

    return {
      items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async banUser(
    adminId: number,
    userId: number,
    reason: string,
  ): Promise<AdminSafeUser> {
    if (adminId === userId) {
      throw new ForbiddenException('An admin cannot ban their own account');
    }

    const user = await this.requireUser(userId);

    await db.orm.public.RefreshToken
      .where({ userId, revokedAt: null })
      .update({ revokedAt: Temporal.Now.instant() });

    banUserRecord({
      userId,
      reason,
      bannedAt: Temporal.Now.instant(),
      bannedBy: adminId,
    });

    return this.toSafeUser(user);
  }

  async unbanUser(userId: number): Promise<AdminSafeUser> {
    const user = await this.requireUser(userId);
    unbanUserRecord(userId);
    return this.toSafeUser(user);
  }

  async activateUser(userId: number): Promise<AdminSafeUser> {
    const user = await this.requireUser(userId);
    activateUserRecord(userId);

    if (user.role === 'mate') {
      await db.orm.public.Mate
        .where({ userId })
        .update({ isActive: true });
    }

    return this.toSafeUser(user);
  }

  async verifyUser(userId: number): Promise<AdminSafeUser> {
    const user = await this.requireUser(userId);

    if (user.role !== 'mate') {
      throw new UnprocessableEntityException('Only mate accounts can be verified');
    }

    verifyUserRecord(userId);
    return this.toSafeUser(user);
  }

  async listBookings(query: {
    status?: string;
    mateId?: number;
    renterId?: number;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<AdminBookingItem>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    let bookingQuery = db.orm.public.Booking as any;

    if (query.status) {
      bookingQuery = bookingQuery.where({ status: query.status });
    }
    if (query.mateId) {
      bookingQuery = bookingQuery.where({ mateId: query.mateId });
    }
    if (query.renterId) {
      bookingQuery = bookingQuery.where({ renterId: query.renterId });
    }

    let paged: any[];
    let total: number;

    if (typeof bookingQuery.orderBy === 'function' && typeof bookingQuery.limit === 'function') {
      const allMatching = await bookingQuery.all();
      total = allMatching.length;
      paged = await bookingQuery
        .orderBy((b: any) => b.createdAt.desc())
        .limit(limit)
        .offset(offset)
        .all();
    } else {
      const allBookings = await bookingQuery.all();
      total = allBookings.length;
      allBookings.sort((a: any, b: any) => {
        const aTime = typeof a.createdAt === 'object' && a.createdAt !== null && 'epochMilliseconds' in a.createdAt
          ? (a.createdAt as Temporal.Instant).epochMilliseconds
          : 0;
        const bTime = typeof b.createdAt === 'object' && b.createdAt !== null && 'epochMilliseconds' in b.createdAt
          ? (b.createdAt as Temporal.Instant).epochMilliseconds
          : 0;
        return bTime - aTime;
      });
      paged = allBookings.slice(offset, offset + limit);
    }

    if (paged.length === 0) {
      return {
        items: [],
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    }

    const renterIds = [...new Set(paged.map((b: any) => b.renterId))];
    const mateIds = [...new Set(paged.map((b: any) => b.mateId))];
    const activityIds = [...new Set(paged.map((b: any) => b.activityId))];

    // Bulk query for Mates using IN operator
    const mates = await db.orm.public.Mate
      .where((m: any) => m.id.in(mateIds))
      .all();
    const mateMap = new Map(mates.map((m: any) => [m.id, m]));

    // Correctly extract the mate users' userIds (not mateIds!)
    const mateUserIds = mates.map((m: any) => m.userId);
    const allUserIds = [...new Set([...renterIds, ...mateUserIds])];

    // Bulk query for Users and Activities in parallel
    const [users, activities] = await Promise.all([
      db.orm.public.User.where((u: any) => u.id.in(allUserIds)).all(),
      db.orm.public.Activity.where((a: any) => a.id.in(activityIds)).all(),
    ]);

    const userMap = new Map(users.map((u: any) => [u.id, u]));
    const activityMap = new Map(activities.map((a: any) => [a.id, a]));

    const items: AdminBookingItem[] = paged.map((booking: any) => {
      const renterUser = userMap.get(booking.renterId);
      const mate = mateMap.get(booking.mateId);
      const mateUser = mate ? userMap.get(mate.userId) : undefined;
      const activity = activityMap.get(booking.activityId);

      return {
        id: booking.id,
        renter: { id: booking.renterId, name: renterUser?.name ?? 'Unknown' },
        mate: { id: booking.mateId, name: mateUser?.name ?? 'Unknown' },
        activity: { id: booking.activityId, name: activity?.name ?? 'Unknown' },
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        totalPrice: booking.totalPrice,
        status: booking.status,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
      };
    });

    return {
      items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getAnalytics(query: {
    from?: string;
    to?: string;
  }): Promise<AnalyticsResult> {
    const now = Temporal.Now.instant().toZonedDateTimeISO('Asia/Bangkok').toPlainDate();
    const toDate = query.to
      ? this.parseCalendarDate(query.to, 'to')
      : now;
    const fromDate = query.from
      ? this.parseCalendarDate(query.from, 'from')
      : toDate.subtract({ days: 29 });

    if (Temporal.PlainDate.compare(fromDate, toDate) > 0) {
      throw new BadRequestException('from must not be after to');
    }

    const daysDiff = fromDate.until(toDate).total({ unit: 'day' });
    if (daysDiff >= 365) {
      throw new BadRequestException('Date range must not exceed 365 days');
    }

    const fromInstant = fromDate
      .toZonedDateTime({ timeZone: 'Asia/Bangkok', plainTime: '00:00' })
      .toInstant();
    const toInstant = toDate
      .add({ days: 1 })
      .toZonedDateTime({ timeZone: 'Asia/Bangkok', plainTime: '00:00' })
      .toInstant();

    const [bookingsInRange, paymentsInRange, usersInRange] = await Promise.all([
      db.orm.public.Booking
        .where((b: any) => b.createdAt.gte(fromInstant))
        .where((b: any) => b.createdAt.lt(toInstant))
        .all(),
      db.orm.public.Payment
        .where({ status: 'paid' })
        .where((p: any) => p.paidAt.gte(fromInstant))
        .where((p: any) => p.paidAt.lt(toInstant))
        .all(),
      db.orm.public.User
        .where((u: any) => u.createdAt.gte(fromInstant))
        .where((u: any) => u.createdAt.lt(toInstant))
        .all(),
    ]);

    const bookingCounts: BookingCountsByStatus = {
      pending: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const b of bookingsInRange) {
      const status = b.status as keyof BookingCountsByStatus;
      if (status in bookingCounts) {
        bookingCounts[status]++;
      }
    }

    const paidRevenue = paymentsInRange.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );

    const newActiveUsers = usersInRange.length;

    const dailyMap = new Map<string, DailyAnalytics>();
    let cursor = fromDate;
    while (Temporal.PlainDate.compare(cursor, toDate) <= 0) {
      dailyMap.set(cursor.toString(), {
        date: cursor.toString(),
        bookings: 0,
        paidRevenue: 0,
        newUsers: 0,
      });
      cursor = cursor.add({ days: 1 });
    }

    for (const b of bookingsInRange) {
      const dateStr = (b.createdAt as Temporal.Instant)
        .toZonedDateTimeISO('Asia/Bangkok')
        .toPlainDate()
        .toString();
      const day = dailyMap.get(dateStr);
      if (day) {
        day.bookings++;
      }
    }

    for (const p of paymentsInRange) {
      if (p.paidAt) {
        const dateStr = (p.paidAt as Temporal.Instant)
          .toZonedDateTimeISO('Asia/Bangkok')
          .toPlainDate()
          .toString();
        const day = dailyMap.get(dateStr);
        if (day) {
          day.paidRevenue += Number(p.amount);
        }
      }
    }

    for (const u of usersInRange) {
      const dateStr = (u.createdAt as Temporal.Instant)
        .toZonedDateTimeISO('Asia/Bangkok')
        .toPlainDate()
        .toString();
      const day = dailyMap.get(dateStr);
      if (day) {
        day.newUsers++;
      }
    }

    const daily = [...dailyMap.values()];

    return {
      range: { from: fromDate.toString(), to: toDate.toString() },
      bookingCounts,
      paidRevenue: Number(paidRevenue.toFixed(2)),
      newActiveUsers,
      daily,
    };
  }

  private parseCalendarDate(value: string, field: string): Temporal.PlainDate {
    try {
      return Temporal.PlainDate.from(value);
    } catch {
      throw new BadRequestException(`${field} must be a valid calendar date in YYYY-MM-DD format`);
    }
  }

  private async requireUser(userId: number) {
    const user = await db.orm.public.User.where({ id: userId }).first();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private toSafeUser(user: {
    id: number;
    name: string;
    email: string;
    role: string;
    createdAt: unknown;
    updatedAt: unknown;
  }): AdminSafeUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isBanned: isUserBanned(user.id),
      isActive: isUserActive(user.id),
      isVerified: isUserVerified(user.id),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
