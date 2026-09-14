import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../users/decorators/current-user.decorator.js';
import type { AuthUser } from '../users/users.types.js';
import type { PaginatedResult } from '../admin/admin.types.js';
import { Roles } from '../admin/roles.decorator.js';
import { RolesGuard } from '../admin/roles.guard.js';
import { BookingsService, type CreateBookingResult } from './bookings.service.js';
import type { BookingDetail, BookingRecord } from './bookings.types.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto.js';

interface ApiResponse<T> {
  status: 'success';
  message: string;
  data: T;
}

@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @Roles('renter')
  async create(
    @CurrentUser() user: AuthUser | undefined,
    @Body() dto: CreateBookingDto,
  ): Promise<ApiResponse<CreateBookingResult>> {
    const renterId = this.requireUserId(user);
    const booking = await this.bookingsService.create(renterId, dto);
    return this.success('Booking request sent', booking);
  }

  @Get()
  async findMine(
    @CurrentUser() user: AuthUser | undefined,
    @Query() query: ListBookingsQueryDto,
  ): Promise<ApiResponse<PaginatedResult<BookingDetail>>> {
    const authUser = this.requireUser(user);
    const result = await this.bookingsService.findMine(authUser, query);
    return this.success('OK', result);
  }

  @Get(':bookingId')
  async findOne(
    @CurrentUser() user: AuthUser | undefined,
    @Param('bookingId', ParseIntPipe) bookingId: number,
  ): Promise<ApiResponse<BookingDetail>> {
    const authUser = this.requireUser(user);
    const result = await this.bookingsService.findOne(authUser, bookingId);
    return this.success('OK', result);
  }

  @Patch(':bookingId/accept')
  @Roles('mate')
  async accept(
    @CurrentUser() user: AuthUser | undefined,
    @Param('bookingId', ParseIntPipe) bookingId: number,
  ): Promise<ApiResponse<BookingRecord>> {
    const authUser = this.requireUser(user);
    const result = await this.bookingsService.accept(authUser, bookingId);
    return this.success('Booking confirmed', result);
  }

  @Patch(':bookingId/decline')
  @Roles('mate')
  async decline(
    @CurrentUser() user: AuthUser | undefined,
    @Param('bookingId', ParseIntPipe) bookingId: number,
  ): Promise<ApiResponse<BookingRecord>> {
    const authUser = this.requireUser(user);
    const result = await this.bookingsService.decline(authUser, bookingId);
    return this.success('Booking declined', result);
  }

  @Patch(':bookingId/cancel')
  async cancel(
    @CurrentUser() user: AuthUser | undefined,
    @Param('bookingId', ParseIntPipe) bookingId: number,
  ): Promise<ApiResponse<BookingRecord>> {
    const authUser = this.requireUser(user);
    const result = await this.bookingsService.cancel(authUser, bookingId);
    return this.success('Booking cancelled', result);
  }

  @Patch(':bookingId/complete')
  async complete(
    @CurrentUser() user: AuthUser | undefined,
    @Param('bookingId', ParseIntPipe) bookingId: number,
  ): Promise<ApiResponse<BookingRecord>> {
    const authUser = this.requireUser(user);
    const result = await this.bookingsService.complete(authUser, bookingId);
    return this.success('Booking completed', result);
  }

  private requireUser(user: AuthUser | undefined): AuthUser {
    if (!user?.id) {
      throw new UnauthorizedException('Authentication is required');
    }
    return user;
  }

  private requireUserId(user: AuthUser | undefined): number {
    return this.requireUser(user).id;
  }

  private success<T>(message: string, data: T): ApiResponse<T> {
    return { status: 'success', message, data };
  }
}
