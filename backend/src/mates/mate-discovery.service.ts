import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Temporal } from '@js-temporal/polyfill';
import type { PaginationMeta } from '../shared/types/pagination.js';
import { MATES_DATABASE_TOKEN } from './mates.tokens.js';
import type {
  MateDiscoveryPage,
  MateDiscoveryQuery,
  MateListItem,
} from './mate-discovery.types.js';
import {
  compareNullableNumber,
  modelRows,
  rowsByIds,
  toEpochMillis,
  toMinutes,
  type DiscoveryDatabase,
} from './mate-discovery.shared.js';
import { isPublicMateOwner } from './mate-visibility.js';

const TIMEZONE = 'Asia/Bangkok';

const parseDate = (value: string): Temporal.Instant => {
  try {
    return Temporal.PlainDate.from(value)
      .toZonedDateTime({ timeZone: TIMEZONE, plainTime: '00:00' })
      .toInstant();
  } catch {
    throw new UnprocessableEntityException('availableDate must be a valid date');
  }
};

const sameDate = (value: unknown, target: Temporal.Instant): boolean => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value === target.toZonedDateTimeISO(TIMEZONE).toPlainDate().toString();
  }
  return toEpochMillis(value) === target.epochMilliseconds;
};

const localMinutes = (value: unknown): number => {
  if (typeof value === 'string') return toMinutes(value);
  const epochMilliseconds = toEpochMillis(value);
  if (!Number.isFinite(epochMilliseconds)) return Number.NaN;
  const local = Temporal.Instant.fromEpochMilliseconds(epochMilliseconds).toZonedDateTimeISO(TIMEZONE);
  return local.hour * 60 + local.minute;
};

const hasOpenWindow = (
  slots: Array<{ startTime: string; endTime: string; dayOfWeek: number }>,
  bookings: Array<{ startTime: unknown; endTime: unknown }>,
  dayOfWeek: number,
): boolean => {
  const daySlots = slots
    .filter((slot) => slot.dayOfWeek === dayOfWeek)
    .map((slot) => ({ start: toMinutes(slot.startTime), end: toMinutes(slot.endTime) }))
    .sort((left, right) => left.start - right.start);
  const reserved = bookings
    .map((booking) => ({ start: localMinutes(booking.startTime), end: localMinutes(booking.endTime) }))
    .sort((left, right) => left.start - right.start);

  return daySlots.some((slot) => {
    let cursor = slot.start;
    for (const booking of reserved) {
      if (booking.end <= cursor) continue;
      if (booking.start >= slot.end) break;
      if (booking.start > cursor) return true;
      cursor = Math.max(cursor, booking.end);
      if (cursor >= slot.end) return false;
    }
    return cursor < slot.end;
  });
};

@Injectable()
export class MateDiscoveryService {
  constructor(@Inject(MATES_DATABASE_TOKEN) private readonly database: DiscoveryDatabase) {}

  async list(query: MateDiscoveryQuery): Promise<MateDiscoveryPage> {
    const tables = this.database.orm.public;
    const mates = (await modelRows(tables.Mate, { isActive: true })).filter((mate) => mate.isActive !== false);
    const mateIds = mates.map((mate) => mate.id);
    const userIds = mates.map((mate) => mate.userId);

    const [users, provinces, districts, activities, interests, mateActivities, mateInterests, reviewAggregates] = await Promise.all([
      rowsByIds(tables.User, 'id', userIds),
      modelRows(tables.Province),
      modelRows(tables.District),
      modelRows(tables.Activity),
      modelRows(tables.Interest),
      rowsByIds(tables.MateActivity, 'mateId', mateIds),
      rowsByIds(tables.MateInterest, 'mateId', mateIds),
      this.reviewAggregates(tables.Review, mateIds),
    ]);

    const usersById = new Map(users.map((user) => [user.id, user]));
    const provincesById = new Map(provinces.map((province) => [province.id, province]));
    const districtsById = new Map(districts.map((district) => [district.id, district]));
    const activitiesById = new Map(activities.map((activity) => [activity.id, activity]));
    const activityIdsByMate = this.groupIds(mateActivities, 'mateId', 'activityId');
    const interestIdsByMate = this.groupIds(mateInterests, 'mateId', 'interestId');

    if (query.provinceId !== undefined && query.districtId !== undefined) {
      const district = districts.find((candidate) => candidate.id === query.districtId);
      if (!district || district.provinceId !== query.provinceId) {
        throw new UnprocessableEntityException('District does not belong to province');
      }
    }
    if (query.activityIds.some((id) => !activities.some((activity) => activity.id === id))) {
      throw new UnprocessableEntityException('Invalid activity lookup');
    }
    if (query.interestIds.some((id) => !interests.some((interest) => interest.id === id))) {
      throw new UnprocessableEntityException('Invalid interest lookup');
    }

    let availableMateIds: Set<number> | undefined;
    if (query.availableDate) {
      const date = parseDate(query.availableDate);
      const today = Temporal.Now.zonedDateTimeISO(TIMEZONE).toPlainDate();
      if (Temporal.PlainDate.compare(date.toZonedDateTimeISO(TIMEZONE).toPlainDate(), today) < 0) {
        throw new UnprocessableEntityException('availableDate cannot be in the past');
      }
      const [availability, bookings] = await Promise.all([
        rowsByIds(
          tables.MateAvailability,
          'mateId',
          mateIds,
          (row: any) => row.dayOfWeek.eq(date.toZonedDateTimeISO(TIMEZONE).dayOfWeek),
        ),
        rowsByIds(
          tables.Booking,
          'mateId',
          mateIds,
          (row: any) => row.date.eq(date) && row.status.in(['pending', 'confirmed']),
        ),
      ]);
      const bookingsByMate = this.groupRows(
        bookings.filter(
          (booking) =>
            sameDate(booking.date, date) &&
            (booking.status === 'pending' || booking.status === 'confirmed'),
        ),
        'mateId',
      );
      availableMateIds = new Set(
        mateIds.filter((mateId) =>
          hasOpenWindow(
            availability.filter((slot) => slot.mateId === mateId),
            bookingsByMate.get(mateId) ?? [],
            date.toZonedDateTimeISO(TIMEZONE).dayOfWeek,
          ),
        ),
      );
    }

    const rows = mates
      .filter((mate) => {
        const user = usersById.get(mate.userId);
        return (
          isPublicMateOwner(user) &&
          (!query.q ||
            user.name.toLocaleLowerCase().includes(query.q.toLocaleLowerCase()) ||
            mate.bio?.toLocaleLowerCase().includes(query.q.toLocaleLowerCase()))
        );
      })
      .filter((mate) => query.provinceId === undefined || mate.provinceId === query.provinceId)
      .filter((mate) => query.districtId === undefined || mate.districtId === query.districtId)
      .filter((mate) => query.minRate === undefined || Number(mate.hourlyRate) >= Number(query.minRate))
      .filter((mate) => query.maxRate === undefined || Number(mate.hourlyRate) <= Number(query.maxRate))
      .filter((mate) => query.activityIds.every((id) => activityIdsByMate.get(mate.id)?.has(id)))
      .filter((mate) => query.interestIds.every((id) => interestIdsByMate.get(mate.id)?.has(id)))
      .filter((mate) => availableMateIds === undefined || availableMateIds.has(mate.id))
      .map((mate) => {
        const user = usersById.get(mate.userId);
        const province = provincesById.get(mate.provinceId);
        const district = districtsById.get(mate.districtId);
        if (!user || !province || !district) throw new Error(`Incomplete mate relation for ${mate.id}`);
        const reviewAggregate = reviewAggregates.get(mate.id);
        const rating = reviewAggregate
          ? Number((reviewAggregate.sum / reviewAggregate.count).toFixed(1))
          : null;
        const item: MateListItem = {
          id: mate.id,
          name: user.name,
          hourlyRate: Number(mate.hourlyRate),
          avgRating: rating,
          reviewCount: reviewAggregate?.count ?? 0,
          province: province.name,
          district: district.name,
          activities: Array.from(activityIdsByMate.get(mate.id) ?? [])
            .map((id) => activitiesById.get(id)?.name)
            .filter((name): name is string => name !== undefined),
          photoUrl: null,
        };
        return { item, createdAt: toEpochMillis(mate.createdAt), rating };
      })
      .filter(({ rating }) =>
        query.minRating === undefined ||
        (rating === null ? query.minRating === 0 : rating >= query.minRating),
      );

    rows.sort((left, right) => {
      const direction = query.sort.startsWith('-') ? -1 : 1;
      const sort = query.sort.replace('-', '');
      const result =
        sort === 'rating'
          ? compareNullableNumber(left.rating, right.rating)
          : sort === 'rate'
            ? left.item.hourlyRate - right.item.hourlyRate
            : left.createdAt - right.createdAt;
      return result === 0 ? left.item.id - right.item.id : result * direction;
    });

    const total = rows.length;
    const meta: PaginationMeta = {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    };
    const pageRows = rows.slice(query.skip, query.skip + query.limit);
    const pagePhotos = await rowsByIds(
      tables.MatePhoto,
      'mateId',
      pageRows.map(({ item }) => item.id),
    );
    const photosByMate = this.groupRows(pagePhotos, 'mateId');
    return {
      items: pageRows.map(({ item }) => ({
        ...item,
        photoUrl:
          photosByMate.get(item.id)?.sort((left, right) => left.sortOrder - right.sortOrder)[0]?.url ??
          mates.find((mate) => mate.id === item.id)?.profileImageUrl ??
          null,
      })),
      meta,
    };
  }

  private async reviewAggregates(
    model: any,
    mateIds: number[],
  ): Promise<Map<number, { count: number; sum: number }>> {
    const aggregates = new Map<number, { count: number; sum: number }>();
    if (mateIds.length === 0) return aggregates;

    if (typeof model?.where !== 'function') {
      const reviews = typeof model?.all === 'function' ? await model.all() : [];
      for (const review of reviews) {
        if (!mateIds.includes(review.mateId)) continue;
        const current = aggregates.get(review.mateId) ?? { count: 0, sum: 0 };
        current.count += 1;
        current.sum += Number(review.rating);
        aggregates.set(review.mateId, current);
      }
      return aggregates;
    }

    const query: any = model.where((row: any) => row.mateId.in(mateIds));
    if (typeof query.groupBy === 'function' && typeof query.aggregate === 'function') {
      const grouped = await query.groupBy('mateId').aggregate((aggregate: any) => ({
        count: aggregate.count(),
        sum: aggregate.sum('rating'),
      }));
      for (const row of grouped) {
        aggregates.set(row.mateId, { count: Number(row.count), sum: Number(row.sum ?? 0) });
      }
      return aggregates;
    }

    const reviews = await rowsByIds(model, 'mateId', mateIds);
    for (const review of reviews) {
      const current = aggregates.get(review.mateId) ?? { count: 0, sum: 0 };
      current.count += 1;
      current.sum += Number(review.rating);
      aggregates.set(review.mateId, current);
    }
    return aggregates;
  }

  private groupIds(rows: any[], groupField: string, valueField: string): Map<number, Set<number>> {
    const grouped = new Map<number, Set<number>>();
    for (const row of rows) {
      const ids = grouped.get(row[groupField]) ?? new Set<number>();
      ids.add(row[valueField]);
      grouped.set(row[groupField], ids);
    }
    return grouped;
  }

  private groupRows(rows: any[], groupField: string): Map<number, any[]> {
    const grouped = new Map<number, any[]>();
    for (const row of rows) {
      const groupedRows = grouped.get(row[groupField]) ?? [];
      groupedRows.push(row);
      grouped.set(row[groupField], groupedRows);
    }
    return grouped;
  }
}
