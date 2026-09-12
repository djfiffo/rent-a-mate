import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Temporal } from '@js-temporal/polyfill';

import { db } from '../prisma/db.js';

import { CreateBookingDto } from './dto/create-booking.dto.js';

@Injectable()
export class BookingsService {
  async create(renterId: number, dto: CreateBookingDto) {
    const mate = await db.orm.public.Mate.where({ id: dto.mateId }).first();
    if (!mate) {
      throw new NotFoundException('Mate not found');
    }

    const activity = await db.orm.public.Activity.where({ id: dto.activityId }).first();
    if (!activity) {
      throw new NotFoundException('Activity not found');
    }

    if (mate.userId === renterId) {
      throw new BadRequestException('You cannot book yourself');
    }

    const date = this.parseDate(dto.date);
    const startTime = this.parseDateTime(dto.date, dto.startTime);
    const endTime = this.parseDateTime(dto.date, dto.endTime);

    if (Temporal.Instant.compare(startTime, endTime) >= 0) {
      throw new BadRequestException('startTime must be before endTime');
    }

    if (Temporal.Instant.compare(startTime, Temporal.Now.instant()) <= 0) {
      throw new BadRequestException('Booking time must be in the future');
    }

    const overlappingBooking = await db.orm.public.Booking
      .where({ mateId: dto.mateId, date })
      .where((booking) => booking.startTime.lt(endTime))
      .where((booking) => booking.endTime.gt(startTime))
      .first();

    if (overlappingBooking) {
      throw new ConflictException('Mate is already booked for this time');
    }

    const durationInHours =
      (endTime.epochMilliseconds - startTime.epochMilliseconds) / 3_600_000;
    const totalPrice = (Number(mate.hourlyRate) * durationInHours).toFixed(2);

    const booking = await db.orm.public.Booking.create({
      renterId,
      mateId: dto.mateId,
      activityId: dto.activityId,
      date,
      startTime,
      endTime,
      totalPrice,
      status: 'pending',
    });

    return booking;
  }

  private parseDate(value: string): Temporal.Instant {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('date must use YYYY-MM-DD format');
    }

    try {
      return Temporal.PlainDate.from(value)
        .toZonedDateTime({
          timeZone: 'Asia/Bangkok',
          plainTime: '00:00',
        })
        .toInstant();
    } catch {
      throw new BadRequestException('date is invalid');
    }
  }

  private parseDateTime(date: string, time: string): Temporal.Instant {
    try {
      if (/^\d{2}:\d{2}$/.test(time)) {
        return Temporal.PlainDate.from(date)
          .toZonedDateTime({
            timeZone: 'Asia/Bangkok',
            plainTime: `${time}:00`,
          })
          .toInstant();
      }

      return Temporal.Instant.from(time);
    } catch {
      throw new BadRequestException('startTime and endTime must be valid date-time values');
    }
  }
}