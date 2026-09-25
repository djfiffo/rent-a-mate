import {
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
import { successResponse, type ApiResponse } from '../shared/http/api-response.js';
import { CurrentUser } from '../shared/http/decorators/current-user.decorator.js';
import type { AuthUser } from '../shared/types/auth-user.js';
import type { PaginatedResult } from '../shared/types/pagination.js';
import { Roles } from '../shared/authorization/roles.decorator.js';
import { RolesGuard } from '../shared/authorization/roles.guard.js';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto.js';
import { PaymentsService } from './payments.service.js';
import type { CreatePaymentResult, PaymentDetail } from './payments.types.js';

function requireUser(user: AuthUser | undefined): AuthUser {
  if (!user?.id) {
    throw new UnauthorizedException('Authentication is required');
  }
  return user;
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
    return successResponse('Payment intent created', result);
  }

  @Post('confirm')
  @Roles('renter')
  async confirmLocalMockPayment(
    @CurrentUser() user: AuthUser | undefined,
    @Param('bookingId', ParseIntPipe) bookingId: number,
  ): Promise<ApiResponse<PaymentDetail>> {
    const authUser = requireUser(user);
    const result = await this.paymentsService.confirmLocalMockPayment(authUser, bookingId);
    return successResponse('Local test payment completed', result);
  }

  @Get()
  async getStatus(
    @CurrentUser() user: AuthUser | undefined,
    @Param('bookingId', ParseIntPipe) bookingId: number,
  ): Promise<ApiResponse<PaymentDetail>> {
    const authUser = requireUser(user);
    const result = await this.paymentsService.getStatus(authUser, bookingId);
    return successResponse('OK', result);
  }

  @Post('refund')
  @Roles('admin')
  async refund(@Param('bookingId', ParseIntPipe) bookingId: number): Promise<ApiResponse<PaymentDetail>> {
    const result = await this.paymentsService.refundAsAdmin(bookingId);
    return successResponse('Refund initiated', result);
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
    return successResponse('OK', result);
  }
}
