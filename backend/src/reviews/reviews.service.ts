import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthUser } from '../shared/types/auth-user.js';
import { REVIEWS_DATABASE_TOKEN } from './reviews.tokens.js';
import type {
  BookingRecordForReview,
  ReviewDatabase,
  ReviewDetail,
  ReviewRecord,
} from './reviews.types.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import { UpdateReviewDto } from './dto/update-review.dto.js';

/**
 * Owns all `reviews` persistence and the REST HTTP surface
 * (`BookingReviewController`/`ReviewsController`) for it. Kept HTTP-agnostic
 * like `PaymentsService`/`BookingsService`: every public method takes a
 * plain `AuthUser` plus primitive/DTO arguments.
 *
 * The service — not `@Roles()` alone — re-checks resource ownership on
 * every mutation, per spec security rule #4.
 */
@Injectable()
export class ReviewsService {
  constructor(
    @Inject(REVIEWS_DATABASE_TOKEN) private readonly database: ReviewDatabase,
  ) {}

  /**
   * Creates the single allowed review for a completed booking. Renter-owner
   * only. Renter/mate IDs are derived from the booking row rather than
   * trusted from the request, per spec 6.6.
   */
  async create(
    user: AuthUser,
    bookingId: number,
    dto: CreateReviewDto,
  ): Promise<ReviewDetail> {
    const booking = await this.requireOwnedBooking(user, bookingId);

    if (booking.status !== 'completed') {
      throw new UnprocessableEntityException('BOOKING_NOT_COMPLETED');
    }

    const existing = await this.database.orm.public.Review.where({
      bookingId,
    }).first();
    if (existing) {
      throw new ConflictException('REVIEW_ALREADY_EXISTS');
    }

    return this.database.transaction(async (tx) => {
      try {
        const created = await tx.orm.public.Review.create({
          bookingId,
          renterId: booking.renterId,
          mateId: booking.mateId,
          rating: dto.rating,
          comment: dto.comment ?? null,
        });
        return this.toDetail(created);
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          // Lost a race against a concurrent create for the same booking.
          throw new ConflictException('REVIEW_ALREADY_EXISTS');
        }
        throw error;
      }
    });
  }

  /**
   * Edits rating and/or comment. Review-owner only (the renter who wrote
   * it) — an admin cannot edit someone else's review, only delete it (see
   * `remove`), per spec 6.6.
   */
  async update(
    user: AuthUser,
    reviewId: number,
    dto: UpdateReviewDto,
  ): Promise<ReviewDetail> {
    const review = await this.requireReview(reviewId);
    if (review.renterId !== user.id) {
      throw new NotFoundException('Review not found');
    }
    if (dto.rating === undefined && dto.comment === undefined) {
      throw new UnprocessableEntityException('NO_REVIEW_FIELDS_PROVIDED');
    }

    const update: { rating?: number; comment?: string | null } = {};
    if (dto.rating !== undefined) {
      update.rating = dto.rating;
    }
    if (dto.comment !== undefined) {
      update.comment = dto.comment;
    }

    const updated = await this.database.orm.public.Review.where({
      id: reviewId,
    }).update(update);
    if (!updated) {
      throw new NotFoundException('Review not found');
    }
    return this.toDetail(updated);
  }

  /**
   * Removes a review. Allowed for the review's own renter or an admin
   * (e.g. moderating a resolved report), per spec 6.6.
   */
  async remove(user: AuthUser, reviewId: number): Promise<void> {
    const review = await this.requireReview(reviewId);
    const isOwner = review.renterId === user.id;
    const isAdmin = user.role === 'admin';
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Only the review author or an admin can remove this review',
      );
    }

    await this.database.orm.public.Review.where({ id: reviewId }).delete();
  }

  /**
   * Verifies `bookingId` exists and belongs to `user` as its renter.
   * Not found (rather than forbidden) is returned for both a missing
   * booking and a non-owner caller, so a client cannot use this endpoint
   * to probe whether a booking id exists — mirrors
   * `PaymentsService.assertParticipant`.
   */
  private async requireOwnedBooking(
    user: AuthUser,
    bookingId: number,
  ): Promise<BookingRecordForReview> {
    const booking = await this.database.orm.public.Booking.where({
      id: bookingId,
    }).first();
    if (!booking || booking.renterId !== user.id) {
      throw new NotFoundException('Booking not found');
    }
    return booking;
  }

  private async requireReview(reviewId: number): Promise<ReviewRecord> {
    const review = await this.database.orm.public.Review.where({
      id: reviewId,
    }).first();
    if (!review) {
      throw new NotFoundException('Review not found');
    }
    return review;
  }

  private toDetail(review: ReviewRecord): ReviewDetail {
    return {
      id: review.id,
      bookingId: review.bookingId,
      renterId: review.renterId,
      mateId: review.mateId,
      rating: review.rating,
      comment: review.comment ?? null,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}
