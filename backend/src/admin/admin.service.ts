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
  AdminReport,
  AdminSafeUser,
  AnalyticsResult,
  BookingCountsByStatus,
  DailyAnalytics,
  PaginatedResult,
  ReportStatus,
  ReportTargetType,
} from './admin.types.js';

const TIMEZONE = 'Asia/Bangkok';
const DEFAULT_LIMIT = 20;
const MAX_ANALYTICS_DAYS = 365;

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
    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = (page - 1) * limit;
    let users: any = db.orm.public.User;

    if (query.role) users = users.where({ role: query.role });
    if (query.isBanned !== undefined) users = users.where({ isBanned: query.isBanned });
    if (query.isActive !== undefined) users = users.where({ isActive: query.isActive });
    if (query.isVerified !== undefined) users = users.where({ isVerified: query.isVerified });
    // Search spans name and email. Keep the predicate in application space
    // because this façade has no public OR combinator yet; this is an
    // admin-only moderation read and never returns password hashes.
    const materializedForSearch = Boolean(query.q);
    let all: any[] | undefined;
    if (materializedForSearch) {
      const materialized: any[] = (await users.all()) ?? [];
      const needle = query.q!.toLowerCase();
      const filtered = materialized.filter((u: any) =>
        String(u.name).toLowerCase().includes(needle) ||
        String(u.email).toLowerCase().includes(needle),
      );
      filtered.sort((a: any, b: any) => this.toEpochMillis(b.createdAt) - this.toEpochMillis(a.createdAt));
      all = filtered;
    }

    const total = all
      ? all.length
      : await this.count(users);
    const rows = all
      ? all.slice(offset, offset + limit)
      : await this.pageQuery(users, limit, offset, (q: any) => q.orderBy((u: any) => u.createdAt.desc()));

    return {
      items: rows.map((user) => this.toSafeUser(user)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async banUser(adminId: number, userId: number, reason: string): Promise<AdminSafeUser> {
    if (adminId === userId) {
      throw new ForbiddenException('An admin cannot ban their own account');
    }
    await this.requireUser(userId);
    const now = Temporal.Now.instant();

    await this.revokeAllActiveRefreshTokens(userId, now);

    const updated = await (db.orm.public.User as any).where({ id: userId }).update({
      isBanned: true,
      bannedAt: now,
      banReason: reason.trim(),
    });
    return this.toSafeUser(updated);
  }

  async unbanUser(userId: number): Promise<AdminSafeUser> {
    await this.requireUser(userId);
    const updated = await (db.orm.public.User as any).where({ id: userId }).update({
      isBanned: false,
      bannedAt: null,
      banReason: null,
    });
    return this.toSafeUser(updated);
  }

  async activateUser(userId: number): Promise<AdminSafeUser> {
    const user = await this.requireUser(userId);
    const updated = await (db.orm.public.User as any).where({ id: userId }).update({
      isActive: true,
      deactivatedAt: null,
    });

    if (user.role === 'mate') {
      await db.orm.public.Mate.where({ userId }).update({ isActive: true });
    }
    return this.toSafeUser(updated);
  }

  async verifyUser(userId: number): Promise<AdminSafeUser> {
    const user = await this.requireUser(userId);
    if (user.role !== 'mate') {
      throw new UnprocessableEntityException('Only mate accounts can be verified');
    }
    const updated = await (db.orm.public.User as any).where({ id: userId }).update({
      isVerified: true,
      verifiedAt: Temporal.Now.instant(),
    });
    return this.toSafeUser(updated);
  }

  async listBookings(query: {
    status?: string;
    mateId?: number;
    renterId?: number;
    date?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<AdminBookingItem>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = (page - 1) * limit;
    let bookings: any = db.orm.public.Booking;

    if (query.status) bookings = bookings.where({ status: query.status });
    if (query.mateId) bookings = bookings.where({ mateId: query.mateId });
    if (query.renterId) bookings = bookings.where({ renterId: query.renterId });
    if (query.date) {
      const instant = this.parseDateInstant(query.date);
      bookings = bookings.where({ date: instant });
    }
    if (query.dateFrom) {
      bookings = bookings.where((b: any) => b.date.gte(this.parseDateInstant(query.dateFrom!)));
    }
    if (query.dateTo) {
      const end = this.parseCalendarDate(query.dateTo!, 'dateTo')
        .add({ days: 1 })
        .toZonedDateTime({ timeZone: TIMEZONE, plainTime: '00:00' })
        .toInstant();
      bookings = bookings.where((b: any) => b.date.lt(end));
    }

    const total = await this.count(bookings);
    const paged = await this.pageQuery(
      bookings,
      limit,
      offset,
      (q: any) => q.orderBy((b: any) => b.createdAt.desc()),
    );
    if (!paged.length) {
      return { items: [], meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    }

    const renterIds = [...new Set(paged.map((b) => b.renterId))];
    const mateIds = [...new Set(paged.map((b) => b.mateId))];
    const activityIds = [...new Set(paged.map((b) => b.activityId))];
    const mates = await db.orm.public.Mate.where((m: any) => m.id.in(mateIds)).all();
    const mateMap = new Map(mates.map((m: any) => [m.id, m]));
    const allUserIds = [...new Set([...renterIds, ...mates.map((m: any) => m.userId)])];
    const [users, activities] = await Promise.all([
      db.orm.public.User.where((u: any) => u.id.in(allUserIds)).all(),
      db.orm.public.Activity.where((a: any) => a.id.in(activityIds)).all(),
    ]);
    const userMap = new Map(users.map((u: any) => [u.id, u]));
    const activityMap = new Map(activities.map((a: any) => [a.id, a]));

    const items = paged.map((booking: any) => {
      const mate = mateMap.get(booking.mateId);
      const renter = userMap.get(booking.renterId);
      const mateUser = mate ? userMap.get(mate.userId) : undefined;
      const activity = activityMap.get(booking.activityId);
      return {
        id: booking.id,
        renter: { id: booking.renterId, name: renter?.name ?? 'Unknown' },
        mate: { id: booking.mateId, name: mateUser?.name ?? 'Unknown' },
        activity: { id: booking.activityId, name: activity?.name ?? 'Unknown' },
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        totalPrice: booking.totalPrice,
        status: booking.status,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
      } satisfies AdminBookingItem;
    });
    return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async createReport(
    reporterId: number,
    input: { targetType: ReportTargetType; targetId: number; reason: string },
  ): Promise<AdminReport> {
    const reporter = await this.requireUser(reporterId);
    await this.validateReportTarget(reporterId, input.targetType, input.targetId);
    const report = await (db.orm.public as any).Report.create({
      reporterId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason.trim(),
      status: 'open',
    });
    return this.toAdminReport(report, reporter);
  }

  async listReports(query: {
    status?: ReportStatus;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<AdminReport>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = (page - 1) * limit;
    let reports: any = (db.orm.public as any).Report;
    if (query.status) reports = reports.where({ status: query.status });
    const total = await this.count(reports);
    const rows = await this.pageQuery(
      reports,
      limit,
      offset,
      (q: any) => q.orderBy((r: any) => r.createdAt.desc()),
    );
    const reporterIds = [...new Set(rows.map((r) => r.reporterId))];
    const reporters = reporterIds.length
      ? await db.orm.public.User.where((u: any) => u.id.in(reporterIds)).all()
      : [];
    const reporterMap = new Map(reporters.map((u: any) => [u.id, u]));
    return {
      items: rows.map((report) => this.toAdminReport(report, reporterMap.get(report.reporterId))),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async resolveReport(
    adminId: number,
    reportId: number,
    input: { status: Exclude<ReportStatus, 'open'>; resolutionNote?: string },
  ): Promise<AdminReport> {
    const report = await this.requireReport(reportId);
    const updated = await (db.orm.public as any).Report.where({ id: reportId }).update({
      status: input.status,
      resolutionNote: input.resolutionNote?.trim() ?? report.resolutionNote ?? null,
      resolvedById: adminId,
      resolvedAt: Temporal.Now.instant(),
    });
    const reporter = await this.requireUser(report.reporterId);
    return this.toAdminReport(updated, reporter);
  }

  async getAnalytics(query: { from?: string; to?: string }): Promise<AnalyticsResult> {
    const today = Temporal.Now.instant().toZonedDateTimeISO(TIMEZONE).toPlainDate();
    const toDate = query.to ? this.parseCalendarDate(query.to, 'to') : today;
    const fromDate = query.from
      ? this.parseCalendarDate(query.from, 'from')
      : toDate.subtract({ days: 29 });
    if (Temporal.PlainDate.compare(fromDate, toDate) > 0) {
      throw new BadRequestException('from must not be after to');
    }
    const daysDiff = fromDate.until(toDate).total({ unit: 'day' });
    if (daysDiff >= MAX_ANALYTICS_DAYS) {
      throw new BadRequestException('Date range must not exceed 365 days');
    }

    const fromInstant = fromDate.toZonedDateTime({ timeZone: TIMEZONE, plainTime: '00:00' }).toInstant();
    const toInstant = toDate.add({ days: 1 }).toZonedDateTime({ timeZone: TIMEZONE, plainTime: '00:00' }).toInstant();
    const bookingRange: any = db.orm.public.Booking
      .where((b: any) => b.createdAt.gte(fromInstant))
      .where((b: any) => b.createdAt.lt(toInstant));
    const paymentRange: any = db.orm.public.Payment
      .where({ status: 'paid' })
      .where((p: any) => p.paidAt.gte(fromInstant))
      .where((p: any) => p.paidAt.lt(toInstant));
    const userRange: any = db.orm.public.User
      .where({ isActive: true })
      .where((u: any) => u.createdAt.gte(fromInstant))
      .where((u: any) => u.createdAt.lt(toInstant));

    const [bookingCounts, revenue, newUsers, daily] = await Promise.all([
      this.aggregateBookingCounts(bookingRange),
      this.aggregateRevenue(paymentRange),
      this.aggregateCount(userRange),
      this.aggregateDaily(fromDate, toDate, {
        bookings: bookingRange,
        payments: paymentRange,
        users: userRange,
      }),
    ]);

    const dailyMap = new Map<string, DailyAnalytics>();
    let cursor = fromDate;
    while (Temporal.PlainDate.compare(cursor, toDate) <= 0) {
      dailyMap.set(cursor.toString(), { date: cursor.toString(), bookings: 0, paidRevenue: 0, newUsers: 0 });
      cursor = cursor.add({ days: 1 });
    }
    for (const row of daily.bookings) dailyMap.get(String(row.date))!.bookings = Number(row.value);
    for (const row of daily.revenue) dailyMap.get(String(row.date))!.paidRevenue = Number(row.value);
    for (const row of daily.users) dailyMap.get(String(row.date))!.newUsers = Number(row.value);
    return {
      range: { from: fromDate.toString(), to: toDate.toString() },
      bookingCounts,
      paidRevenue: Number(revenue.toFixed(2)),
      newActiveUsers: newUsers,
      daily: [...dailyMap.values()],
    };
  }

  private async aggregateBookingCounts(query: any): Promise<BookingCountsByStatus> {
    const result: BookingCountsByStatus = { pending: 0, confirmed: 0, completed: 0, cancelled: 0 };
    if (typeof query.groupBy === 'function') {
      const grouped = await query.groupBy('status').aggregate((a: any) => ({ total: a.count() }));
      for (const row of grouped) {
        if (row.status in result) result[row.status as keyof BookingCountsByStatus] = Number(row.total);
      }
      return result;
    }
    // Test doubles and pre-aggregate runtimes may not expose groupBy. The
    // production Prisma façade does, so this branch is only a compatibility fallback.
    for (const row of await query.all()) {
      if (row.status in result) result[row.status as keyof BookingCountsByStatus]++;
    }
    return result;
  }

  private async aggregateRevenue(query: any): Promise<number> {
    if (typeof query.aggregate === 'function') {
      const result = await query.aggregate((a: any) => ({ total: a.sum('amount') }));
      return Number(result.total ?? 0);
    }
    return (await query.all()).reduce((sum: number, p: any) => sum + Number(p.amount), 0);
  }

  private async aggregateCount(query: any): Promise<number> {
    if (typeof query.aggregate === 'function') {
      const result = await query.aggregate((a: any) => ({ total: a.count() }));
      return Number(result.total);
    }
    return (await query.all()).length;
  }

  private async aggregateDaily(
    fromDate: Temporal.PlainDate,
    toDate: Temporal.PlainDate,
    boundedQueries?: { bookings: any; payments: any; users: any },
  ): Promise<{ bookings: { date: string; value: number }[]; revenue: { date: string; value: number }[]; users: { date: string; value: number }[] }> {
    const daily = (date: unknown) => {
      if (date instanceof Temporal.Instant) return date.toZonedDateTimeISO(TIMEZONE).toPlainDate().toString();
      return String(date).slice(0, 10);
    };
    const rangeRows = async (
      model: any,
      timestamp: string,
      valueFor: (row: any) => number = () => 1,
      include: (row: any) => boolean = () => true,
    ) => {
      if (!model) return [];
      const rows = await model.all();
      const map = new Map<string, number>();
      for (const row of rows) {
        if (!include(row) || !row[timestamp]) continue;
        const day = daily(row[timestamp]);
        if (day >= fromDate.toString() && day <= toDate.toString()) {
          map.set(day, (map.get(day) ?? 0) + valueFor(row));
        }
      }
      return [...map].map(([date, value]) => ({ date, value }));
    };
    return {
      bookings: await rangeRows(boundedQueries?.bookings ?? (db.orm.public as any).Booking, 'createdAt'),
      revenue: await rangeRows(
        boundedQueries?.payments ?? (db.orm.public as any).Payment,
        'paidAt',
        (row) => Number(row.amount),
        (row) => row.status === 'paid',
      ),
      users: await rangeRows(
        boundedQueries?.users ?? (db.orm.public as any).User,
        'createdAt',
        () => 1,
        (row) => row.isActive ?? true,
      ),
    };
  }

  private async validateReportTarget(reporterId: number, targetType: ReportTargetType, targetId: number): Promise<void> {
    if (targetType === 'user') {
      await this.requireUser(targetId);
      if (reporterId === targetId) throw new BadRequestException('You cannot report your own account');
      return;
    }
    if (targetType === 'mate') {
      const mate = await db.orm.public.Mate.where({ id: targetId }).first();
      if (!mate) throw new NotFoundException('Report target not found');
      if (mate.userId === reporterId) throw new BadRequestException('You cannot report your own profile');
      return;
    }
    if (targetType === 'booking') {
      const booking = await db.orm.public.Booking.where({ id: targetId }).first();
      if (!booking) throw new NotFoundException('Report target not found');
      const mate = await db.orm.public.Mate.where({ id: booking.mateId }).first();
      if (booking.renterId !== reporterId && mate?.userId !== reporterId) {
        throw new ForbiddenException('You can only report a booking you participated in');
      }
      return;
    }
    if (targetType === 'review') {
      const review = await (db.orm.public as any).Review.where({ id: targetId }).first();
      if (!review) throw new NotFoundException('Report target not found');
      if (review.renterId !== reporterId) {
        const mate = await db.orm.public.Mate.where({ id: review.mateId }).first();
        if (mate?.userId !== reporterId) throw new ForbiddenException('You can only report a related review');
      }
      return;
    }
    // Message storage is not present in the current generated contract. Keep
    // this explicit so a report cannot be created for a phantom target.
    const messageModel = (db.orm.public as any).Message;
    if (!messageModel) throw new NotFoundException('Report target not found');
    const message = await messageModel.where({ id: targetId }).first();
    if (!message) throw new NotFoundException('Report target not found');
    const booking = await db.orm.public.Booking.where({ id: message.bookingId }).first();
    const mate = booking ? await db.orm.public.Mate.where({ id: booking.mateId }).first() : null;
    if (!booking || (booking.renterId !== reporterId && mate?.userId !== reporterId)) {
      throw new ForbiddenException('You can only report a related message');
    }
  }

  private async requireUser(userId: number): Promise<any> {
    const user = await db.orm.public.User.where({ id: userId }).first();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async requireReport(reportId: number): Promise<any> {
    const report = await (db.orm.public as any).Report.where({ id: reportId }).first();
    if (!report) throw new NotFoundException('Report not found');
    return report;
  }

  private toSafeUser(user: any): AdminSafeUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isBanned: user.isBanned ?? false,
      isActive: user.isActive ?? true,
      isVerified: user.isVerified ?? false,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private toAdminReport(report: any, reporter?: any): AdminReport {
    return {
      id: report.id,
      reporterId: report.reporterId,
      reporter: { id: report.reporterId, name: reporter?.name ?? 'Unknown' },
      targetType: report.targetType,
      targetId: report.targetId,
      reason: report.reason,
      status: report.status,
      resolutionNote: report.resolutionNote ?? null,
      resolvedById: report.resolvedById ?? null,
      resolvedAt: report.resolvedAt ?? null,
      createdAt: report.createdAt,
    };
  }

  private async count(query: any): Promise<number> {
    if (typeof query.aggregate === 'function') {
      const result = await query.aggregate((aggregate: any) => ({ total: aggregate.count() }));
      return Number(result.total);
    }
    return (await query.all()).length;
  }

  private async revokeAllActiveRefreshTokens(userId: number, revokedAt: Temporal.Instant): Promise<void> {
    const refreshTokens = db.orm.public.RefreshToken;
    const activeTokens = await refreshTokens.where({ userId, revokedAt: null }).all();
    await Promise.all(
      activeTokens.map((token) =>
        refreshTokens.where({ id: token.id, revokedAt: null }).update({ revokedAt }),
      ),
    );
  }

  private async pageQuery(query: any, limit: number, offset: number, order: (q: any) => any): Promise<any[]> {
    if (typeof query.orderBy === 'function' && typeof query.limit === 'function') {
      const ordered = order(query);
      const limited = ordered.limit(limit);
      if (typeof limited.offset === 'function') {
        return limited.offset(offset).all();
      }
      if (typeof ordered.offset === 'function') {
        return ordered.offset(offset).limit(limit).all();
      }
      const rows = await ordered.limit(offset + limit).all();
      return rows.slice(offset, offset + limit);
    }
    const rows = await query.all();
    rows.sort((a: any, b: any) => this.toEpochMillis(b.createdAt) - this.toEpochMillis(a.createdAt));
    return rows.slice(offset, offset + limit);
  }

  private toEpochMillis(value: unknown): number {
    if (value && typeof value === 'object' && 'epochMilliseconds' in value) {
      return Number((value as Temporal.Instant).epochMilliseconds);
    }
    return value ? new Date(String(value)).getTime() || 0 : 0;
  }

  private parseCalendarDate(value: string, field: string): Temporal.PlainDate {
    try {
      return Temporal.PlainDate.from(value);
    } catch {
      throw new BadRequestException(`${field} must be a valid calendar date in YYYY-MM-DD format`);
    }
  }

  private parseDateInstant(value: string): Temporal.Instant {
    return this.parseCalendarDate(value, 'date')
      .toZonedDateTime({ timeZone: TIMEZONE, plainTime: '00:00' })
      .toInstant();
  }
}
