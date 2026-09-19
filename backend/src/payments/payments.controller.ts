import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto.js';
import { PaymentsService } from './payments.service.js';
import type { CreatePaymentResult, PaymentDetail } from './payments.types.js';

interface ApiResponse<T> {
  status: 'success';
  message: string;
  data: T;
}

function requireUser(user: AuthUser | undefined): AuthUser {
  if (!user?.id) {
    throw new UnauthorizedException('Authentication is required');
  }
  return user;
}

function success<T>(message: string, data: T): ApiResponse<T> {
  return { status: 'success', message, data };
}

/**
 * `/bookings/:bookingId/payment` REST surface, per spec 6.8. Split from
 * `PaymentsController` because these two routes are nested under a
 * different path than the flat `/payments` history endpoint.
 */
@Controller('bookings/:bookingId/payment')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BookingPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @Roles('renter')
  async pay(
    @CurrentUser() user: AuthUser | undefined,
    @Param('bookingId', ParseIntPipe) bookingId: number,
  ): Promise<ApiResponse<CreatePaymentResult>> {
    const authUser = requireUser(user);
    const result = await this.paymentsService.pay(authUser, bookingId);
    return success('Payment intent created', result);
  }

  @Get()
  async getStatus(
    @CurrentUser() user: AuthUser | undefined,
    @Param('bookingId', ParseIntPipe) bookingId: number,
  ): Promise<ApiResponse<PaymentDetail>> {
    const authUser = requireUser(user);
    const result = await this.paymentsService.getStatus(authUser, bookingId);
    return success('OK', result);
  }

  @Post('refund')
  @Roles('admin')
  async refund(@Param('bookingId', ParseIntPipe) bookingId: number): Promise<ApiResponse<PaymentDetail>> {
    const result = await this.paymentsService.refundAsAdmin(bookingId);
    return success('Refund initiated', result);
  }
}

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  async listMine(
    @CurrentUser() user: AuthUser | undefined,
    @Query() query: ListPaymentsQueryDto,
  ): Promise<ApiResponse<PaginatedResult<PaymentDetail>>> {
    const authUser = requireUser(user);
    const result = await this.paymentsService.listMine(authUser, query);
    return success('OK', result);
  }
}
