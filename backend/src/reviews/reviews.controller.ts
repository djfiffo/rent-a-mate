import { Body, Controller, Delete, Param, ParseIntPipe, Patch, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../users/decorators/current-user.decorator.js';
import type { AuthUser } from '../users/users.types.js';
import { Roles } from '../admin/roles.decorator.js';
import { RolesGuard } from '../admin/roles.guard.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import { UpdateReviewDto } from './dto/update-review.dto.js';
import { ReviewsService } from './reviews.service.js';
import type { ReviewDetail } from './reviews.types.js';

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
 * `/bookings/:bookingId/review` REST surface, per spec 6.6. Split from
 * `ReviewsController` because this route is nested under a different path
 * than the flat `/reviews/:reviewId` edit/delete endpoints — mirrors
 * `BookingPaymentsController`/`PaymentsController`.
 */
@Controller('bookings/:bookingId/review')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BookingReviewController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @Roles('renter')
  async create(
    @CurrentUser() user: AuthUser | undefined,
    @Param('bookingId', ParseIntPipe) bookingId: number,
    @Body() dto: CreateReviewDto,
  ): Promise<ApiResponse<ReviewDetail>> {
    const authUser = requireUser(user);
    const result = await this.reviewsService.create(authUser, bookingId, dto);
    return success('Review created', result);
  }
}

@Controller('reviews')
@UseGuards(JwtAuthGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Patch(':reviewId')
  async update(
    @CurrentUser() user: AuthUser | undefined,
    @Param('reviewId', ParseIntPipe) reviewId: number,
    @Body() dto: UpdateReviewDto,
  ): Promise<ApiResponse<ReviewDetail>> {
    const authUser = requireUser(user);
    const result = await this.reviewsService.update(authUser, reviewId, dto);
    return success('Review updated', result);
  }

  @Delete(':reviewId')
  async remove(
    @CurrentUser() user: AuthUser | undefined,
    @Param('reviewId', ParseIntPipe) reviewId: number,
  ): Promise<ApiResponse<null>> {
    const authUser = requireUser(user);
    await this.reviewsService.remove(authUser, reviewId);
    return success('Review removed', null);
  }
}
