import {
  Body,
  Controller,
  Delete,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
  successResponse,
  type ApiResponse,
} from '../shared/http/api-response.js';
import { CurrentUser } from '../shared/http/decorators/current-user.decorator.js';
import type { AuthUser } from '../shared/types/auth-user.js';
import { Roles } from '../shared/authorization/roles.decorator.js';
import { RolesGuard } from '../shared/authorization/roles.guard.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import { UpdateReviewDto } from './dto/update-review.dto.js';
import { ReviewsService } from './reviews.service.js';
import type { ReviewDetail } from './reviews.types.js';

function requireUser(user: AuthUser | undefined): AuthUser {
  if (!user?.id) {
    throw new UnauthorizedException('Authentication is required');
  }
  return user;
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
    return successResponse('Review created', result);
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
    return successResponse('Review updated', result);
  }

  @Delete(':reviewId')
  async remove(
    @CurrentUser() user: AuthUser | undefined,
    @Param('reviewId', ParseIntPipe) reviewId: number,
  ): Promise<ApiResponse<null>> {
    const authUser = requireUser(user);
    await this.reviewsService.remove(authUser, reviewId);
    return successResponse('Review removed', null);
  }
}
