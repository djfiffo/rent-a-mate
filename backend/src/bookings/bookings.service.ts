import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Temporal } from '@js-temporal/polyfill';

import { MateAvailabilityService } from '../mates/mate-availability.service.js';
import { requireBookableMate } from '../mates/mate-visibility.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { db } from '../prisma/db.js';
import type { AuthUser } from '../shared/types/auth-user.js';
import type { PaginatedResult } from '../shared/types/pagination.js';
import { BOOKINGS_DATABASE_TOKEN } from './bookings.tokens.js';
import type {
  BookingDatabase,
  BookingDetail,
  BookingRecord,
  BookingStatus,
  MateRecordForBooking,
} from './bookings.types.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto.js';

const TIMEZONE = 'Asia/Bangkok';
const MIN_DURATION_MINUTES = 60;
const MAX_DURATION_MINUTES = 480;
const DURATION_STEP_MINUTES = 30;

export interface CreateBookingResult {
  id: BookingRecord['id'];
  status: BookingRecord['status'];
  totalPrice: BookingRecord['totalPrice'];
}

@Injectable()
export class BookingsService {
  constructor(
    @Inject(BOOKINGS_DATABASE_TOKEN) private readonly database: BookingDatabase,
    private readonly mateAvailabilityService: MateAvailabilityService,
    private readonly notificationsService: NotificationsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async create(renterId: number, dto: CreateBookingDto): Promise<CreateBookingResult> {
    const { mate } = await requireBookableMate(this.database as any, dto.mateId);
    if (mate.userId === renterId) {
      throw new BadRequestException('You cannot book yourself');
    }
    const activity = await this.database.orm.public.Activity.where({ id: dto.activityId }).first();
    if (!activity) {
      throw new NotFoundException('Activity not found');
    }

    const mateActivity = await this.database.orm.public.MateActivity
      .where({ mateId: dto.mateId, activityId: dto.activityId })
      .first();
    if (!mateActivity) {
      throw new UnprocessableEntityException('Activity is not listed on this mate profile');
    }

    const date = this.parseDate(dto.date);
    const startTime = this.parseDateTime(dto.date, dto.startTime);
    const endTime = this.parseDateTime(dto.date, dto.endTime);

    if (Temporal.Instant.compare(startTime, endTime) >= 0) {
      throw new BadRequestException('startTime must be before endTime');
    }
    if (Temporal.Instant.compare(startTime, Temporal.Now.instant()) <= 0) {
      throw new UnprocessableEntityException('Booking time must be in the future');
    }

    const durationMinutes = (endTime.epochMilliseconds - startTime.epochMilliseconds) / 60_000;
    if (
      durationMinutes % DURATION_STEP_MINUTES !== 0 ||
      durationMinutes < MIN_DURATION_MINUTES ||
      durationMinutes > MAX_DURATION_MINUTES
    ) {
      throw new UnprocessableEntityException(
        'Booking duration must be in 30-minute increments between 1 and 8 hours',
      );
    }

    const isAvailable = await this.mateAvailabilityService.isWithinAvailability(
      dto.mateId,
      Temporal.PlainDate.from(dto.date),
      dto.startTime,
      dto.endTime,
    );
    if (!isAvailable) {
      throw new UnprocessableEntityException("Requested time is outside the mate's availability");
    }

    const dateInstant = date;

    const booking = await this.database.transaction(async (tx) => {
      const lockMatePlan = db.raw.sql`
        SELECT "id"
        FROM "public"."mate"
        WHERE "id" = ${dto.mateId}
        FOR UPDATE
      `.returnsRow({ id: { codecId: 'pg/int4@1' } }).build();
      const lockedMates = await tx.query(lockMatePlan);
      if (lockedMates.length !== 1) {
        throw new NotFoundException('Mate not found');
      }

      const overlapping = await tx.orm.public.Booking
        .where({ mateId: dto.mateId, date: dateInstant })
        .where((row) => row.status.in(['pending', 'confirmed']))
        .where((row) => row.startTime.lt(endTime))
        .where((row) => row.endTime.gt(startTime))
        .first();

      if (overlapping) {
        throw new ConflictException('Mate is already booked for this time');
      }

      const durationHours = durationMinutes / 60;
      const totalPrice = (Number(mate.hourlyRate) * durationHours).toFixed(2);

      const created = await tx.orm.public.Booking.create({
        renterId,
        mateId: dto.mateId,
        activityId: dto.activityId,
        date: dateInstant,
        startTime,
        endTime,
        totalPrice,
        status: 'pending',
      });

      await this.notificationsService.create(
        {
          userId: mate.userId,
          type: 'booking_requested',
          message: `You have a new booking request for ${dto.date} ${dto.startTime}-${dto.endTime}`,
          bookingId: created.id,
        },
        tx,
      );

      return created;
    });

    return { id: booking.id, status: booking.status, totalPrice: booking.totalPrice };
  }

  async findMine(user: AuthUser, query: ListBookingsQueryDto): Promise<PaginatedResult<BookingDetail>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const participantFilter = await this.buildParticipantFilter(user);
    if (!participantFilter) {
      return { items: [], meta: { page, limit, total: 0, totalPages: 0 } };
    }

    const filters = query.status ? { ...participantFilter, status: query.status } : participantFilter;
    const all = await this.database.orm.public.Booking.where(filters).all();

    const sorted = [...all].sort((a, b) => this.toEpochMillis(b.createdAt) - this.toEpochMillis(a.createdAt));
    const total = sorted.length;
    const offset = (page - 1) * limit;
    const paged = sorted.slice(offset, offset + limit);

    const items = await this.toBookingDetails(paged);

    return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(user: AuthUser, bookingId: number): Promise<BookingDetail> {
    const { booking, mate } = await this.requireBookingWithMate(bookingId);
    const isAdmin = user.role === 'admin';
    const isParticipant = booking.renterId === user.id || mate.userId === user.id;
    if (!isAdmin && !isParticipant) {
      throw new NotFoundException('Booking not found');
    }

    const [detail] = await this.toBookingDetails([booking]);
    return detail;
  }

  async accept(user: AuthUser, bookingId: number): Promise<BookingRecord> {
    const { booking, mate } = await this.requireBookingWithMate(bookingId);
    if (mate.userId !== user.id) {
      throw new ForbiddenException('Only the mate who owns this booking can accept it');
    }
    if (booking.status === 'confirmed') {
      return booking;
    }
    this.assertTransition(booking.status, 'pending');

    return this.database.transaction(async (tx) => {
      const updated = await tx.orm.public.Booking.where({ id: bookingId }).update({ status: 'confirmed' });
      if (!updated) {
        throw new NotFoundException('Booking not found');
      }

      await this.notificationsService.create(
        {
          userId: booking.renterId,
          type: 'booking_confirmed',
          message: 'Your booking request has been confirmed',
          bookingId: booking.id,
        },
        tx,
      );

      return updated;
    });
  }

  async decline(user: AuthUser, bookingId: number): Promise<BookingRecord> {
    const { booking, mate } = await this.requireBookingWithMate(bookingId);
    if (mate.userId !== user.id) {
      throw new ForbiddenException('Only the mate who owns this booking can decline it');
    }
    if (booking.status === 'cancelled') {
      return booking;
    }
    this.assertTransition(booking.status, 'pending');

    return this.database.transaction(async (tx) => {
      const updated = await tx.orm.public.Booking.where({ id: bookingId }).update({ status: 'cancelled' });
      if (!updated) {
        throw new NotFoundException('Booking not found');
      }

      await this.notificationsService.create(
        {
          userId: booking.renterId,
          type: 'booking_declined',
          message: 'Your booking request was declined',
          bookingId: booking.id,
        },
        tx,
      );

      return updated;
    });
  }

  async cancel(user: AuthUser, bookingId: number): Promise<BookingRecord> {
    const { booking, mate } = await this.requireBookingWithMate(bookingId);
    const isRenter = booking.renterId === user.id;
    const isMateOwner = mate.userId === user.id;
    const isAdmin = user.role === 'admin';
    if (!isRenter && !isMateOwner && !isAdmin) {
      throw new ForbiddenException('You are not a participant in this booking');
    }
    if (booking.status === 'cancelled') {
      return booking;
    }
    if (booking.status !== 'pending' && booking.status !== 'confirmed') {
      throw new UnprocessableEntityException('INVALID_BOOKING_TRANSITION');
    }
    if (Temporal.Instant.compare(Temporal.Now.instant(), booking.startTime) >= 0) {
      throw new UnprocessableEntityException('Booking cannot be cancelled after its start time');
    }

    return this.database.transaction(async (tx) => {
      const updated = await tx.orm.public.Booking.where({ id: bookingId }).update({ status: 'cancelled' });
      if (!updated) {
        throw new NotFoundException('Booking not found');
      }

      // Auto-refund: only bookings that were already `paid` at cancel time
      // have anything to refund — `refund()` returns `null` (a no-op) for
      // bookings that were never paid, or already refunding/refunded.
      await this.paymentsService.refund(bookingId, tx);

      const recipients = new Set<number>([booking.renterId, mate.userId]);
      recipients.delete(user.id);
      for (const recipientId of recipients) {
        await this.notificationsService.create(
          {
            userId: recipientId,
            type: 'booking_cancelled',
            message: 'A booking has been cancelled',
            bookingId: booking.id,
          },
          tx,
        );
      }

      return updated;
    });
  }

  async complete(user: AuthUser, bookingId: number): Promise<BookingRecord> {
    const { booking, mate } = await this.requireBookingWithMate(bookingId);
    const isMateOwner = mate.userId === user.id;
    const isAdmin = user.role === 'admin';
    if (!isMateOwner && !isAdmin) {
      throw new ForbiddenException('Only the mate who owns this booking or an admin can complete it');
    }
    if (booking.status === 'completed') {
      return booking;
    }
    this.assertTransition(booking.status, 'confirmed');
    if (Temporal.Instant.compare(Temporal.Now.instant(), booking.endTime) <= 0) {
      throw new UnprocessableEntityException('Booking cannot be completed before its end time');
    }

    return this.database.transaction(async (tx) => {
      const updated = await tx.orm.public.Booking.where({ id: bookingId }).update({ status: 'completed' });
      if (!updated) {
        throw new NotFoundException('Booking not found');
      }

      await this.notificationsService.create(
        {
          userId: booking.renterId,
          type: 'booking_completed',
          message: 'Your booking has been marked as completed',
          bookingId: booking.id,
        },
        tx,
      );

      return updated;
    });
  }

  private assertTransition(current: BookingStatus, expected: BookingStatus): void {
    if (current !== expected) {
      throw new UnprocessableEntityException('INVALID_BOOKING_TRANSITION');
    }
  }

  private async requireBookingWithMate(
    bookingId: number,
  ): Promise<{ booking: BookingRecord; mate: MateRecordForBooking }> {
    const booking = await this.database.orm.public.Booking.where({ id: bookingId }).first();
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const mate = await this.database.orm.public.Mate.where({ id: booking.mateId }).first();
    if (!mate) {
      throw new NotFoundException('Mate not found');
    }

    return { booking, mate };
  }

  private async buildParticipantFilter(user: AuthUser): Promise<Record<string, unknown> | null> {
    if (user.role === 'mate') {
      const mate = await this.database.orm.public.Mate.where({ userId: user.id }).first();
      return mate ? { mateId: mate.id } : null;
    }

    return { renterId: user.id };
  }

  private async toBookingDetails(bookings: BookingRecord[]): Promise<BookingDetail[]> {
    if (bookings.length === 0) {
      return [];
    }

    const mateIds = [...new Set(bookings.map((booking) => booking.mateId))];
    const activityIds = [...new Set(bookings.map((booking) => booking.activityId))];

    const mates = await this.database.orm.public.Mate.where((m) => m.id.in(mateIds)).all();
    const mateMap = new Map(mates.map((mate) => [mate.id, mate]));

    const renterIds = bookings.map((booking) => booking.renterId);
    const mateUserIds = mates.map((mate) => mate.userId);
    const userIds = [...new Set([...renterIds, ...mateUserIds])];
    const users = await this.database.orm.public.User.where((u) => u.id.in(userIds)).all();
    const userMap = new Map(users.map((user) => [user.id, user]));

    const activities = await this.database.orm.public.Activity.where((a) => a.id.in(activityIds)).all();
    const activityMap = new Map(activities.map((activity) => [activity.id, activity]));

    const bookingIds = bookings.map((booking) => booking.id);
    const reviews = await this.database.orm.public.Review.where((r) => r.bookingId.in(bookingIds)).all();
    const reviewByBookingId = new Map(reviews.map((review) => [review.bookingId, review]));

    return bookings.map((booking) => {
      const mate = mateMap.get(booking.mateId);
      const mateUser = mate ? userMap.get(mate.userId) : undefined;
      const renterUser = userMap.get(booking.renterId);
      const activity = activityMap.get(booking.activityId);
      const review = reviewByBookingId.get(booking.id);

      return {
        id: booking.id,
        status: booking.status,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        totalPrice: booking.totalPrice,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
        renter: { id: booking.renterId, name: renterUser?.name ?? 'Unknown' },
        mate: { id: booking.mateId, name: mateUser?.name ?? 'Unknown' },
        activity: { id: booking.activityId, name: activity?.name ?? 'Unknown' },
        review: review
          ? {
              id: review.id,
              rating: review.rating,
              comment: review.comment ?? null,
              createdAt: review.createdAt,
              updatedAt: review.updatedAt,
            }
          : null,
      };
    });
  }

  private toEpochMillis(value: unknown): number {
    if (value instanceof Temporal.Instant) {
      return value.epochMilliseconds;
    }
    if (typeof value === 'object' && value !== null && 'epochMilliseconds' in value) {
      return (value as Temporal.Instant).epochMilliseconds;
    }
    return 0;
  }

  private parseDate(value: string): Temporal.Instant {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('date must use YYYY-MM-DD format');
    }

    try {
      return Temporal.PlainDate.from(value)
        .toZonedDateTime({
          timeZone: TIMEZONE,
          plainTime: '00:00',
        })
        .toInstant();
    } catch {
      throw new BadRequestException('date is invalid');
    }
  }

  private parseDateTime(date: string, time: string): Temporal.Instant {
    try {
      return Temporal.PlainDate.from(date)
        .toZonedDateTime({
          timeZone: TIMEZONE,
          plainTime: `${time}:00`,
        })
        .toInstant();
    } catch {
      throw new BadRequestException('startTime and endTime must be valid time values');
    }
  }
}
