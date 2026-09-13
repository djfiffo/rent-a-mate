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

@Injectable()
export class AdminService {
  async listUsers(query: {
    q?: string;
    role?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<AdminSafeUser>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    let allUsers = await db.orm.public.User.all();

    if (query.q) {
      const search = query.q.toLowerCase();
      allUsers = allUsers.filter(
        (user) =>
          user.name.toLowerCase().includes(search) ||
          user.email.toLowerCase().includes(search),
      );
    }

    if (query.role) {
      allUsers = allUsers.filter((user) => user.role === query.role);
    }

    allUsers.sort((a, b) => {
      const aTime = typeof a.createdAt === 'object' && a.createdAt !== null && 'epochMilliseconds' in a.createdAt
        ? (a.createdAt as Temporal.Instant).epochMilliseconds
        : 0;
      const bTime = typeof b.createdAt === 'object' && b.createdAt !== null && 'epochMilliseconds' in b.createdAt
        ? (b.createdAt as Temporal.Instant).epochMilliseconds
        : 0;
      return bTime - aTime;
    });

    const total = allUsers.length;
    const offset = (page - 1) * limit;
    const items = allUsers.slice(offset, offset + limit).map((user) => this.toSafeUser(user));

    return {
      items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async banUser(
    adminId: number,
    userId: number,
    _reason: string,
  ): Promise<AdminSafeUser> {
    if (adminId === userId) {
      throw new ForbiddenException('An admin cannot ban their own account');
    }

    const user = await this.requireUser(userId);

    await db.orm.public.RefreshToken
      .where({ userId, revokedAt: null })
      .update({ revokedAt: Temporal.Now.instant() });

    return this.toSafeUser(user);
  }

  async unbanUser(userId: number): Promise<AdminSafeUser> {
    const user = await this.requireUser(userId);
    return this.toSafeUser(user);
  }

  async activateUser(userId: number): Promise<AdminSafeUser> {
    const user = await this.requireUser(userId);
    return this.toSafeUser(user);
  }

  async verifyUser(userId: number): Promise<AdminSafeUser> {
    const user = await this.requireUser(userId);

    if (user.role !== 'mate') {
      throw new UnprocessableEntityException('Only mate accounts can be verified');
    }

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

    let allBookings = await db.orm.public.Booking.all();

    if (query.status) {
      allBookings = allBookings.filter((b) => b.status === query.status);
    }
    if (query.mateId) {
      allBookings = allBookings.filter((b) => b.mateId === query.mateId);
    }
    if (query.renterId) {
      allBookings = allBookings.filter((b) => b.renterId === query.renterId);
    }

    allBookings.sort((a, b) => {
      const aTime = typeof a.createdAt === 'object' && a.createdAt !== null && 'epochMilliseconds' in a.createdAt
        ? (a.createdAt as Temporal.Instant).epochMilliseconds
        : 0;
      const bTime = typeof b.createdAt === 'object' && b.createdAt !== null && 'epochMilliseconds' in b.createdAt
        ? (b.createdAt as Temporal.Instant).epochMilliseconds
        : 0;
      return bTime - aTime;
    });

    const total = allBookings.length;
    const offset = (page - 1) * limit;
    const paged = allBookings.slice(offset, offset + limit);

    const userIds = [...new Set(paged.flatMap((b) => [b.renterId, b.mateId]))];
    const activityIds = [...new Set(paged.map((b) => b.activityId))];
    const mateIds = [...new Set(paged.map((b) => b.mateId))];

    const [users, activities, mates] = await Promise.all([
      Promise.all(userIds.map((id) => db.orm.public.User.where({ id }).first())),
      Promise.all(activityIds.map((id) => db.orm.public.Activity.where({ id }).first())),
      Promise.all(mateIds.map((id) => db.orm.public.Mate.where({ id }).first())),
    ]);

    const userMap = new Map(users.filter(Boolean).map((u) => [u!.id, u!]));
    const activityMap = new Map(activities.filter(Boolean).map((a) => [a!.id, a!]));
    const mateMap = new Map(mates.filter(Boolean).map((m) => [m!.id, m!]));

    const items: AdminBookingItem[] = paged.map((booking) => {
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
    const now = Temporal.Now.plainDateISO();
    const toDate = query.to
      ? Temporal.PlainDate.from(query.to)
      : now;
    const fromDate = query.from
      ? Temporal.PlainDate.from(query.from)
      : toDate.subtract({ days: 30 });

    if (Temporal.PlainDate.compare(fromDate, toDate) > 0) {
      throw new BadRequestException('from must not be after to');
    }

    const daysDiff = fromDate.until(toDate).total({ unit: 'day' });
    if (daysDiff > 365) {
      throw new BadRequestException('Date range must not exceed 365 days');
    }

    const fromInstant = fromDate
      .toZonedDateTime({ timeZone: 'Asia/Bangkok', plainTime: '00:00' })
      .toInstant();
    const toInstant = toDate
      .add({ days: 1 })
      .toZonedDateTime({ timeZone: 'Asia/Bangkok', plainTime: '00:00' })
      .toInstant();

    const [allBookings, allPayments, allUsers] = await Promise.all([
      db.orm.public.Booking.all(),
      db.orm.public.Payment.all(),
      db.orm.public.User.all(),
    ]);

    const bookingsInRange = allBookings.filter((b) => {
      const ts = b.createdAt as Temporal.Instant;
      return (
        Temporal.Instant.compare(ts, fromInstant) >= 0 &&
        Temporal.Instant.compare(ts, toInstant) < 0
      );
    });

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

    const bookingIds = new Set(bookingsInRange.map((b) => b.id));
    const paymentsInRange = allPayments.filter(
      (p) => bookingIds.has(p.bookingId) && p.status === 'paid',
    );
    const paidRevenue = paymentsInRange.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );

    const usersInRange = allUsers.filter((u) => {
      const ts = u.createdAt as Temporal.Instant;
      return (
        Temporal.Instant.compare(ts, fromInstant) >= 0 &&
        Temporal.Instant.compare(ts, toInstant) < 0
      );
    });
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
      const booking = allBookings.find((b) => b.id === p.bookingId);
      if (booking) {
        const dateStr = (booking.createdAt as Temporal.Instant)
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
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
