import { Body, Controller, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { BookingsService } from './bookings.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

type AuthenticatedRequest = Request & {
  user?: {
    id?: number;
  };
};

@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  async create(@Req() request: AuthenticatedRequest, @Body() dto: CreateBookingDto) {
    const renterId = request.user?.id;
    if (!renterId) {
      throw new UnauthorizedException('Authentication is required');
    }

    const booking = await this.bookingsService.create(renterId, dto);

    return {
      status: 'success',
      message: 'Booking created successfully',
      data: booking,
    };
  }
}