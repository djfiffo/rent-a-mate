import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Temporal } from '@js-temporal/polyfill';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { NotificationDatabase } from '../notifications/notifications.types.js';
import { BookingsService } from './bookings.service.js';
import type { BookingDatabase } from './bookings.types.js';

type Row = Record<string, unknown>;
type Filter = Row | ((proxy: never) => boolean);

function compareValues(a: unknown, b: unknown): number {
  const av = a instanceof Temporal.Instant ? a.epochMilliseconds : a;
  const bv = b instanceof Temporal.Instant ? b.epochMilliseconds : b;
  if (av === bv) return 0;
  return (av as number) > (bv as number) ? 1 : -1;
}

function matchesFilter(row: Row, filter: Filter): boolean {
  if (typeof filter === 'function') {
    const proxy = new Proxy(
      {},
      {
        get: (_target, key: string) => ({
          eq: (value: unknown) => row[key] === value,
          gt: (value: unknown) => compareValues(row[key], value) > 0,
          lt: (value: unknown) => compareValues(row[key], value) < 0,
          in: (values: unknown[]) => values.includes(row[key]),
        }),
      },
    );
    return filter(proxy as never);
  }
  return Object.entries(filter).every(([key, value]) => compareValues(row[key], value) === 0);
}

function createTable(rows: Row[], idField: string | null, nextId: { value: number }) {
  const makeQuery = (filters: Filter[]) => ({
    where: (filter: Filter) => makeQuery([...filters, filter]),
    first: async () => rows.find((row) => filters.every((filter) => matchesFilter(row, filter))) ?? null,
    all: async () => rows.filter((row) => filters.every((filter) => matchesFilter(row, filter))),
    update: async (data: Row) => {
      const target = rows.find((row) => filters.every((filter) => matchesFilter(row, filter)));
      if (!target) return null;
      Object.assign(target, data);
      return { ...target };
    },
  });

  return {
    where: (filter: Filter) => makeQuery([filter]),
    create: async (data: Row) => {
      const row: Row = { ...data };
      if (idField && row[idField] === undefined) {
        row[idField] = nextId.value++;
      }
      rows.push(row);
      return { ...row };
    },
    rows,
  };
}

const FUTURE_DATE = '2999-01-10';

function createFixture() {
  const mateRows: Row[] = [
    { id: 3, userId: 5, hourlyRate: '200.00', isActive: true },
    { id: 4, userId: 6, hourlyRate: '100.00', isActive: false },
  ];
  const activityRows: Row[] = [{ id: 2, name: 'Running' }];
  const mateActivityRows: Row[] = [{ mateId: 3, activityId: 2 }, { mateId: 4, activityId: 2 }];
  const userRows: Row[] = [
    { id: 5, name: 'Mate User', role: 'mate' },
    { id: 6, name: 'Inactive Mate User', role: 'mate' },
    { id: 7, name: 'Renter User', role: 'renter' },
    { id: 8, name: 'Other Renter', role: 'renter' },
    { id: 55, name: 'Another Mate User', role: 'mate' },
  ];
  const bookingRows: Row[] = [];
  const notificationRows: Row[] = [];
  const paymentRows: Row[] = [];
  const reviewRows: Row[] = [];

  const mateTable = createTable(mateRows, 'id', { value: 100 });
  const activityTable = createTable(activityRows, 'id', { value: 100 });
  const mateActivityTable = createTable(mateActivityRows, null, { value: 0 });
  const userTable = createTable(userRows, 'id', { value: 100 });
  const bookingTable = createTable(bookingRows, 'id', { value: 1 });
  const notificationTable = createTable(notificationRows, 'id', { value: 1 });
  const paymentTable = createTable(paymentRows, 'id', { value: 1 });
  const reviewTable = createTable(reviewRows, 'id', { value: 1 });

  const database: BookingDatabase = {
    query: vi.fn(async () => [{ id: 3 }]) as never,
    orm: {
      public: {
        Booking: bookingTable as never,
        Mate: mateTable as never,
        Activity: activityTable as never,
        User: userTable as never,
        MateActivity: mateActivityTable as never,
        Payment: paymentTable as never,
        Review: reviewTable as never,
        Notification: notificationTable as never,
      },
    },
    transaction: async (callback) => callback(database),
  };

  const notificationsService = new NotificationsService(database as unknown as NotificationDatabase);
  const mateAvailabilityService = { isWithinAvailability: vi.fn().mockResolvedValue(true) };
  // `refund()` is exercised directly by `PaymentsService`'s own tests — here
  // it is stubbed as a no-op (nothing paid, nothing to refund) so
  // BookingsService.cancel() tests can focus on booking/notification state.
  const paymentsService = { refund: vi.fn().mockResolvedValue(null) };

  const service = new BookingsService(
    database,
    mateAvailabilityService as never,
    notificationsService,
    paymentsService as never,
  );

  return { service, database, mateRows, userRows, bookingRows, notificationRows, reviewRows, mateAvailabilityService, paymentsService };
}

describe('BookingsService', () => {
  let fixture: ReturnType<typeof createFixture>;

  beforeEach(() => {
    fixture = createFixture();
  });

  describe('create', () => {
    const dto = { mateId: 3, activityId: 2, date: FUTURE_DATE, startTime: '10:00', endTime: '12:00' };

    it('creates a pending booking, computes totalPrice, and notifies the mate', async () => {
      const result = await fixture.service.create(7, dto);

      expect(result.status).toBe('pending');
      expect(result.totalPrice).toBe('400.00');
      expect(fixture.bookingRows).toHaveLength(1);
      expect(fixture.notificationRows).toEqual([
        expect.objectContaining({ userId: 5, type: 'booking_requested', bookingId: result.id }),
      ]);
    });

    it('rejects booking yourself', async () => {
      await expect(fixture.service.create(5, dto)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when the mate does not exist', async () => {
      await expect(fixture.service.create(7, { ...dto, mateId: 999 })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when the mate profile is not active', async () => {
      await expect(fixture.service.create(7, { ...dto, mateId: 4 })).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('rejects booking a mate whose owning user is banned', async () => {
      fixture.userRows.find((user) => user.id === 5)!.isBanned = true;
      await expect(fixture.service.create(7, dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when the activity does not exist', async () => {
      await expect(fixture.service.create(7, { ...dto, activityId: 999 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects when the activity is not listed on the mate profile', async () => {
      fixture.mateRows.push({ id: 9, userId: 55, hourlyRate: '150.00', isActive: true });
      await expect(fixture.service.create(7, { ...dto, mateId: 9 })).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('rejects when startTime is not before endTime', async () => {
      await expect(
        fixture.service.create(7, { ...dto, startTime: '12:00', endTime: '10:00' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when the requested time is in the past', async () => {
      await expect(
        fixture.service.create(7, { ...dto, date: '2000-01-01' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rejects durations shorter than 1 hour', async () => {
      await expect(
        fixture.service.create(7, { ...dto, startTime: '10:00', endTime: '10:30' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rejects durations longer than 8 hours', async () => {
      await expect(
        fixture.service.create(7, { ...dto, startTime: '08:00', endTime: '17:00' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rejects durations that are not 30-minute increments', async () => {
      await expect(
        fixture.service.create(7, { ...dto, startTime: '10:00', endTime: '11:10' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rejects when the mate is unavailable at the requested time', async () => {
      fixture.mateAvailabilityService.isWithinAvailability.mockResolvedValueOnce(false);
      await expect(fixture.service.create(7, dto)).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rejects overlapping bookings for the same mate', async () => {
      await fixture.service.create(7, dto);
      await expect(fixture.service.create(8, { ...dto, startTime: '11:00', endTime: '13:00' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('allows a non-overlapping booking for the same mate on the same day', async () => {
      await fixture.service.create(7, dto);
      const second = await fixture.service.create(8, { ...dto, startTime: '13:00', endTime: '14:00' });
      expect(second.status).toBe('pending');
      expect(fixture.bookingRows).toHaveLength(2);
    });
  });

  describe('lifecycle transitions', () => {
    const dto = { mateId: 3, activityId: 2, date: FUTURE_DATE, startTime: '10:00', endTime: '12:00' };

    it('lets the mate owner accept a pending booking and notifies the renter', async () => {
      const created = await fixture.service.create(7, dto);
      fixture.notificationRows.length = 0;

      const accepted = await fixture.service.accept({ id: 5, role: 'mate' }, created.id);

      expect(accepted.status).toBe('confirmed');
      expect(fixture.notificationRows).toEqual([
        expect.objectContaining({ userId: 7, type: 'booking_confirmed' }),
      ]);
    });

    it('is idempotent when accepting an already-confirmed booking', async () => {
      const created = await fixture.service.create(7, dto);
      await fixture.service.accept({ id: 5, role: 'mate' }, created.id);
      const again = await fixture.service.accept({ id: 5, role: 'mate' }, created.id);
      expect(again.status).toBe('confirmed');
    });

    it('rejects accept from someone other than the mate owner', async () => {
      const created = await fixture.service.create(7, dto);
      await expect(fixture.service.accept({ id: 7, role: 'renter' }, created.id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('lets the mate owner decline a pending booking and notifies the renter', async () => {
      const created = await fixture.service.create(7, dto);
      fixture.notificationRows.length = 0;

      const declined = await fixture.service.decline({ id: 5, role: 'mate' }, created.id);

      expect(declined.status).toBe('cancelled');
      expect(fixture.notificationRows).toEqual([
        expect.objectContaining({ userId: 7, type: 'booking_declined' }),
      ]);
    });

    it('rejects accepting a booking that is not pending', async () => {
      const created = await fixture.service.create(7, dto);
      await fixture.service.decline({ id: 5, role: 'mate' }, created.id);
      await expect(fixture.service.accept({ id: 5, role: 'mate' }, created.id)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('lets the renter cancel a future pending booking and notifies the mate', async () => {
      const created = await fixture.service.create(7, dto);
      fixture.notificationRows.length = 0;

      const cancelled = await fixture.service.cancel({ id: 7, role: 'renter' }, created.id);

      expect(cancelled.status).toBe('cancelled');
      expect(fixture.notificationRows).toEqual([
        expect.objectContaining({ userId: 5, type: 'booking_cancelled' }),
      ]);
    });

    it('lets an admin cancel and notifies both participants', async () => {
      const created = await fixture.service.create(7, dto);
      fixture.notificationRows.length = 0;

      await fixture.service.cancel({ id: 99, role: 'admin' }, created.id);

      const recipients = fixture.notificationRows.map((row) => row.userId).sort();
      expect(recipients).toEqual([5, 7]);
    });

    it('rejects cancel from someone who is not a participant or admin', async () => {
      const created = await fixture.service.create(7, dto);
      await expect(fixture.service.cancel({ id: 8, role: 'renter' }, created.id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('lets the mate owner complete a confirmed booking after its end time and notifies the renter', async () => {
      const created = await fixture.service.create(7, dto);
      await fixture.service.accept({ id: 5, role: 'mate' }, created.id);
      await fixture.database.orm.public.Booking.where({ id: created.id }).update({
        endTime: Temporal.Now.instant().subtract({ hours: 1 }),
      });
      fixture.notificationRows.length = 0;

      const completed = await fixture.service.complete({ id: 5, role: 'mate' }, created.id);

      expect(completed.status).toBe('completed');
      expect(fixture.notificationRows).toEqual([
        expect.objectContaining({ userId: 7, type: 'booking_completed' }),
      ]);
    });

    it('rejects completing a confirmed booking before its end time', async () => {
      const created = await fixture.service.create(7, dto);
      await fixture.service.accept({ id: 5, role: 'mate' }, created.id);
      await expect(fixture.service.complete({ id: 5, role: 'mate' }, created.id)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('rejects cancelling a booking after its start time', async () => {
      const created = await fixture.service.create(7, dto);
      await fixture.database.orm.public.Booking.where({ id: created.id }).update({
        startTime: Temporal.Now.instant().subtract({ hours: 1 }),
      });
      await expect(fixture.service.cancel({ id: 7, role: 'renter' }, created.id)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });

  describe('findMine / findOne', () => {
    const dto = { mateId: 3, activityId: 2, date: FUTURE_DATE, startTime: '10:00', endTime: '12:00' };

    it('lists only the current renter own bookings', async () => {
      await fixture.service.create(7, dto);
      await fixture.service.create(8, { ...dto, startTime: '13:00', endTime: '14:00' });

      const result = await fixture.service.findMine({ id: 7, role: 'renter' }, {});
      expect(result.items).toHaveLength(1);
      expect(result.items[0].renter.id).toBe(7);
    });

    it('lists only the current mate own bookings', async () => {
      await fixture.service.create(7, dto);

      const result = await fixture.service.findMine({ id: 5, role: 'mate' }, {});
      expect(result.items).toHaveLength(1);
      expect(result.items[0].mate.id).toBe(3);
    });

    it('returns an empty page for an admin with no bookings of their own', async () => {
      await fixture.service.create(7, dto);
      const result = await fixture.service.findMine({ id: 99, role: 'admin' }, {});
      expect(result.items).toHaveLength(0);
    });

    it('allows a participant to view booking detail', async () => {
      const created = await fixture.service.create(7, dto);
      const detail = await fixture.service.findOne({ id: 7, role: 'renter' }, created.id);
      expect(detail.id).toBe(created.id);
    });

    it('surfaces review as null when the booking has no review yet', async () => {
      const created = await fixture.service.create(7, dto);
      const detail = await fixture.service.findOne({ id: 7, role: 'renter' }, created.id);
      expect(detail.review).toBeNull();
    });

    it('surfaces the review state once a review row exists for the booking', async () => {
      const created = await fixture.service.create(7, dto);
      fixture.reviewRows.push({
        id: 1,
        bookingId: created.id,
        renterId: 7,
        mateId: 3,
        rating: 5,
        comment: 'Great mate!',
        createdAt: 'now',
        updatedAt: 'now',
      });

      const detail = await fixture.service.findOne({ id: 7, role: 'renter' }, created.id);
      expect(detail.review).toEqual(
        expect.objectContaining({ id: 1, rating: 5, comment: 'Great mate!' }),
      );
    });

    it('rejects viewing a booking detail for a non-participant, non-admin caller', async () => {
      const created = await fixture.service.create(7, dto);
      await expect(fixture.service.findOne({ id: 8, role: 'renter' }, created.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
