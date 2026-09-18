import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Temporal } from '@js-temporal/polyfill';
import { CreateMateAvailabilityDto } from './dto/create-mate-availability.dto.js';
import { UpdateMateAvailabilityDto } from './dto/update-mate-availability.dto.js';
import { ReplaceMateAvailabilityDto } from './dto/replace-mate-availability.dto.js';
import { MATES_DATABASE_TOKEN } from './mates.tokens.js';
import { requirePublicMate } from './mate-visibility.js';
import type {
  MateAvailabilityRecord,
  MateDatabase,
  MateQueryRecord,
} from './mates.types.js';

const TIMEZONE = 'Asia/Bangkok';

export interface MateOpenInterval {
  startTime: string;
  endTime: string;
}

@Injectable()
export class MateAvailabilityService {
  constructor(
    @Inject(MATES_DATABASE_TOKEN)
    private readonly database: MateDatabase,
  ) {}

  async create(
    userId: number,
    input: CreateMateAvailabilityDto,
  ): Promise<MateAvailabilityRecord> {
    const mate = await this.requireActiveMate(userId);

    this.validateTimeRange(input.startTime, input.endTime);

    const existing = await this.database.orm.public.MateAvailability
      .where({
        mateId: mate.id,
        dayOfWeek: input.dayOfWeek,
      })
      .all();

    this.ensureNoOverlap(
      existing,
      input.startTime,
      input.endTime,
    );

    return this.database.orm.public.MateAvailability.create({
      mateId: mate.id,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
    });
  }

  async findMine(
    userId: number,
  ): Promise<MateAvailabilityRecord[]> {
    const mate = await this.requireMate(userId);

    const availability = await this.database.orm.public.MateAvailability
      .where({ mateId: mate.id })
      .all();

    return availability.sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) {
        return a.dayOfWeek - b.dayOfWeek;
      }

      return this.timeToMinutes(a.startTime) - this.timeToMinutes(b.startTime);
    });
  }

  async update(
    userId: number,
    availabilityId: number,
    input: UpdateMateAvailabilityDto,
  ): Promise<MateAvailabilityRecord> {
    const mate = await this.requireActiveMate(userId);

    if (
      input.dayOfWeek === undefined &&
      input.startTime === undefined &&
      input.endTime === undefined
    ) {
      throw new BadRequestException(
        'At least one availability field is required',
      );
    }

    const current = await this.database.orm.public.MateAvailability
      .where({
        id: availabilityId,
        mateId: mate.id,
      })
      .first();

    if (!current) {
      throw new NotFoundException('Availability not found');
    }

    const dayOfWeek = input.dayOfWeek ?? current.dayOfWeek;
    const startTime = input.startTime ?? current.startTime;
    const endTime = input.endTime ?? current.endTime;

    this.validateTimeRange(startTime, endTime);

    const existing = await this.database.orm.public.MateAvailability
      .where({
        mateId: mate.id,
        dayOfWeek,
      })
      .all();

    this.ensureNoOverlap(
      existing,
      startTime,
      endTime,
      current.id,
    );

    const updated = await this.database.orm.public.MateAvailability
      .where({
        id: current.id,
        mateId: mate.id,
      })
      .update({
        dayOfWeek,
        startTime,
        endTime,
      });

    if (!updated) {
      throw new NotFoundException('Availability not found');
    }

    return updated;
  }

  async remove(
    userId: number,
    availabilityId: number,
  ): Promise<void> {
    const mate = await this.requireActiveMate(userId);

    const current = await this.database.orm.public.MateAvailability
      .where({
        id: availabilityId,
        mateId: mate.id,
      })
      .first();

    if (!current) {
      throw new NotFoundException('Availability not found');
    }

    await this.database.orm.public.MateAvailability
      .where({
        id: current.id,
        mateId: mate.id,
      })
      .delete();
  }

  async isWithinAvailability(
    mateId: number,
    date: Temporal.PlainDate,
    startTime: string,
    endTime: string,
  ): Promise<boolean> {
    this.validateTimeRange(startTime, endTime);

    const dayOfWeek = date.dayOfWeek;

    const availability = await this.database.orm.public.MateAvailability
      .where({
        mateId,
        dayOfWeek,
      })
      .all();

    const requestedStart = this.timeToMinutes(startTime);
    const requestedEnd = this.timeToMinutes(endTime);

    return availability.some((slot) => {
      const slotStart = this.timeToMinutes(slot.startTime);
      const slotEnd = this.timeToMinutes(slot.endTime);

      return (
        requestedStart >= slotStart &&
        requestedEnd <= slotEnd
      );
    });
  }

  /** Replace the complete weekly schedule in one database transaction. */
  async replace(
    userId: number,
    input: ReplaceMateAvailabilityDto | CreateMateAvailabilityDto[],
  ): Promise<MateAvailabilityRecord[]> {
    if (!Array.isArray(input) && !Array.isArray(input.slots) && !Array.isArray(input.availability) && !Array.isArray(input.windows)) {
      throw new BadRequestException('Availability slots are required');
    }
    const windows = Array.isArray(input)
      ? input
      : input.slots ?? input.availability ?? input.windows ?? [];

    this.validateSchedule(windows);

    await this.database.transaction(async (transaction) => {
      const mate = await this.requireActiveMate(userId, transaction);
      await transaction.orm.public.MateAvailability
        .where({ mateId: mate.id })
        .deleteAndCount();

      for (const window of windows) {
        await transaction.orm.public.MateAvailability.create({
          mateId: mate.id,
          dayOfWeek: window.dayOfWeek,
          startTime: window.startTime,
          endTime: window.endTime,
        });
      }
    });

    return this.findMine(userId);
  }

  /**
   * Return only the open intervals for one local Bangkok calendar date.  A
   * booking is blocking only while pending or confirmed; subtraction is done
   * in minutes so a booking can split a weekly window into two results.
   */
  async getPublicAvailability(mateId: number, dateValue: string): Promise<MateOpenInterval[]> {
    const date = this.parseDate(dateValue);
    await requirePublicMate(this.database, mateId);

    const [weekly, bookings] = await Promise.all([
      this.database.orm.public.MateAvailability.where({ mateId, dayOfWeek: date.dayOfWeek }).all(),
      this.database.orm.public.Booking.where({
        mateId,
        date: date.toZonedDateTime({ timeZone: TIMEZONE, plainTime: '00:00' }).toInstant(),
      }).all(),
    ]);

    const blocking = bookings
      .filter((booking) => (booking.status === 'pending' || booking.status === 'confirmed') && this.bookingMatchesDate(booking, date))
      .map((booking) => this.bookingInterval(booking, date))
      .filter((interval): interval is [number, number] => interval !== null);

    return weekly
      .sort((left, right) => this.timeToMinutes(left.startTime) - this.timeToMinutes(right.startTime))
      .flatMap((window) => this.subtractIntervals(window, blocking));
  }

  // Alias kept for callers that use the discovery terminology.
  async findForDate(mateId: number, dateValue: string): Promise<MateOpenInterval[]> {
    return this.getPublicAvailability(mateId, dateValue);
  }

  private async requireMate(userId: number, source: MateDatabase = this.database) {
    const mate = await source.orm.public.Mate
      .where({ userId })
      .first();

    if (!mate) {
      throw new NotFoundException('Mate profile not found');
    }

    return mate;
  }

  private async requireActiveMate(userId: number, source: MateDatabase = this.database) {
    const mate = await this.requireMate(userId, source);
    if (mate.isActive === false) throw new UnprocessableEntityException('Mate profile is not active');
    return mate;
  }

  private validateTimeRange(
    startTime: string,
    endTime: string,
  ): void {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) {
      throw new BadRequestException('Time values must use HH:mm format');
    }
    const start = this.timeToMinutes(startTime);
    const end = this.timeToMinutes(endTime);

    if (start >= end) {
      throw new BadRequestException(
        'Start time must be before end time',
      );
    }
  }

  private ensureNoOverlap(
    existing: MateAvailabilityRecord[],
    startTime: string,
    endTime: string,
    excludeId?: number,
  ): void {
    const newStart = this.timeToMinutes(startTime);
    const newEnd = this.timeToMinutes(endTime);

    const overlaps = existing.some((slot) => {
      if (excludeId !== undefined && slot.id === excludeId) {
        return false;
      }

      const existingStart = this.timeToMinutes(slot.startTime);
      const existingEnd = this.timeToMinutes(slot.endTime);

      return (
        existingStart < newEnd &&
        existingEnd > newStart
      );
    });

    if (overlaps) {
      throw new ConflictException(
        'Availability overlaps with an existing time range',
      );
    }
  }

  private validateSchedule(windows: CreateMateAvailabilityDto[]): void {
    const byDay = new Map<number, MateAvailabilityRecord[]>();
    for (const window of windows) {
      this.validateTimeRange(window.startTime, window.endTime);
      const existing = byDay.get(window.dayOfWeek) ?? [];
      this.ensureNoOverlap(existing, window.startTime, window.endTime);
      existing.push({
        id: -1,
        mateId: -1,
        dayOfWeek: window.dayOfWeek,
        startTime: window.startTime,
        endTime: window.endTime,
        createdAt: null,
        updatedAt: null,
      });
      byDay.set(window.dayOfWeek, existing);
    }
  }

  private parseDate(value: string): Temporal.PlainDate {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('date must use YYYY-MM-DD format');
    }
    let date: Temporal.PlainDate;
    try {
      date = Temporal.PlainDate.from(value);
    } catch {
      throw new BadRequestException('date is invalid');
    }
    const today = Temporal.Now.zonedDateTimeISO(TIMEZONE).toPlainDate();
    if (Temporal.PlainDate.compare(date, today) < 0) {
      throw new UnprocessableEntityException('date cannot be in the past');
    }
    return date;
  }

  private bookingMatchesDate(booking: MateQueryRecord, date: Temporal.PlainDate): boolean {
    const raw = booking.date;
    if (raw && typeof raw === 'object' && 'toString' in raw) {
      const value = String(raw);
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value === date.toString();
    }
    if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw === date.toString();
    const millis = this.epochMilliseconds(raw);
    if (millis === null) return false;
    return Temporal.Instant.fromEpochMilliseconds(millis)
      .toZonedDateTimeISO(TIMEZONE)
      .toPlainDate()
      .equals(date);
  }

  private bookingInterval(booking: MateQueryRecord, date: Temporal.PlainDate): [number, number] | null {
    const start = this.timeValueToMinutes(booking.startTime, date);
    const end = this.timeValueToMinutes(booking.endTime, date);
    if (start === null || end === null || start >= end) return null;
    return [start, end];
  }

  private timeValueToMinutes(value: unknown, date: Temporal.PlainDate): number | null {
    if (typeof value === 'string' && /^\d{2}:\d{2}/.test(value)) {
      return this.timeToMinutes(value.slice(0, 5));
    }
    if (value && typeof value === 'object' && 'hour' in value && 'minute' in value) {
      const time = value as { hour: number; minute: number };
      return time.hour * 60 + time.minute;
    }
    const millis = this.epochMilliseconds(value);
    if (millis === null) return null;
    const local = Temporal.Instant.fromEpochMilliseconds(millis).toZonedDateTimeISO(TIMEZONE);
    return local.toPlainDate().equals(date) ? local.hour * 60 + local.minute : null;
  }

  private epochMilliseconds(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value instanceof Date) return value.getTime();
    if (value && typeof value === 'object' && 'epochMilliseconds' in value) {
      const millis = Number((value as { epochMilliseconds: unknown }).epochMilliseconds);
      return Number.isFinite(millis) ? millis : null;
    }
    if (typeof value === 'string') {
      const millis = Date.parse(value);
      return Number.isNaN(millis) ? null : millis;
    }
    return null;
  }

  private subtractIntervals(
    window: MateAvailabilityRecord,
    bookings: [number, number][],
  ): MateOpenInterval[] {
    const start = this.timeToMinutes(window.startTime);
    const end = this.timeToMinutes(window.endTime);
    let cursor = start;
    const open: MateOpenInterval[] = [];

    for (const [bookingStart, bookingEnd] of bookings
      .filter(([bookingStart, bookingEnd]) => bookingStart < end && bookingEnd > start)
      .sort((left, right) => left[0] - right[0])) {
      const clippedStart = Math.max(start, bookingStart);
      const clippedEnd = Math.min(end, bookingEnd);
      if (clippedStart > cursor) open.push(this.interval(cursor, clippedStart));
      cursor = Math.max(cursor, clippedEnd);
      if (cursor >= end) break;
    }

    if (cursor < end) open.push(this.interval(cursor, end));
    return open;
  }

  private interval(start: number, end: number): MateOpenInterval {
    return { startTime: this.minutesToTime(start), endTime: this.minutesToTime(end) };
  }

  private minutesToTime(minutes: number): string {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);

    return hours * 60 + minutes;
  }
}
