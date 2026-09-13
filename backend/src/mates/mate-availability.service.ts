import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Temporal } from '@js-temporal/polyfill';
import { CreateMateAvailabilityDto } from './dto/create-mate-availability.dto.js';
import { UpdateMateAvailabilityDto } from './dto/update-mate-availability.dto.js';
import { MATES_DATABASE_TOKEN } from './mates.tokens.js';
import type {
  MateAvailabilityRecord,
  MateDatabase,
} from './mates.types.js';

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
    const mate = await this.requireMate(userId);

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
    const mate = await this.requireMate(userId);

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
    const mate = await this.requireMate(userId);

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

  private async requireMate(userId: number) {
    const mate = await this.database.orm.public.Mate
      .where({ userId })
      .first();

    if (!mate) {
      throw new NotFoundException('Mate profile not found');
    }

    return mate;
  }

  private validateTimeRange(
    startTime: string,
    endTime: string,
  ): void {
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

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);

    return hours * 60 + minutes;
  }
}