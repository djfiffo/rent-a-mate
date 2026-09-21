import { Inject, Injectable } from '@nestjs/common';
import { MATES_DATABASE_TOKEN } from '../internal/mates.tokens.js';
import { averageRating, rowsByIds, toEpochMillis, type DiscoveryDatabase } from '../discovery/mate-discovery.shared.js';
import { requirePublicMate } from '../internal/mate-visibility.js';

export interface MateReviewPage {
  averageRating: number | null;
  reviewCount: number;
  items: Array<{
    id: number;
    rating: number;
    comment: string | null;
    renter: { id: number; name: string };
    createdAt: unknown;
    updatedAt: unknown;
  }>;
  meta: { page: number; limit: number; total: number; totalPages: number };
}

@Injectable()
export class MateReviewService {
  constructor(@Inject(MATES_DATABASE_TOKEN) private readonly database: DiscoveryDatabase) {}

  async list(mateId: number, query: { page?: number; limit?: number }): Promise<MateReviewPage> {
    const tables = this.database.orm.public;
    await requirePublicMate(this.database, mateId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;
    const reviewQuery: any = tables.Review.where({ mateId });

    let total: number;
    let ratingSum = 0;
    if (typeof reviewQuery.aggregate === 'function') {
      const summary = await reviewQuery.aggregate((aggregate: any) => ({
        total: aggregate.count(),
        ratingSum: aggregate.sum('rating'),
      }));
      total = Number(summary.total ?? 0);
      ratingSum = Number(summary.ratingSum ?? 0);
    } else {
      const allReviews = await reviewQuery.all();
      total = allReviews.length;
      ratingSum = allReviews.reduce((sum: number, review: any) => sum + Number(review.rating), 0);
    }

    let pageReviews: any[];
    if (typeof reviewQuery.orderBy === 'function' && typeof reviewQuery.limit === 'function') {
      const ordered = reviewQuery.orderBy((review: any) => review.createdAt.desc());
      const limited = ordered.limit(limit);
      pageReviews = typeof limited.offset === 'function'
        ? await limited.offset(offset).all()
        : (await ordered.limit(offset + limit).all()).slice(offset, offset + limit);
    } else {
      const allReviews = await reviewQuery.all();
      pageReviews = [...allReviews]
        .sort((left, right) => toEpochMillis(right.createdAt) - toEpochMillis(left.createdAt))
        .slice(offset, offset + limit);
    }

    const users = await rowsByIds(tables.User, 'id', pageReviews.map((review) => review.renterId));
    const usersById = new Map(users.map((user) => [user.id, user]));
    const items = pageReviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment ?? null,
      renter: { id: review.renterId, name: usersById.get(review.renterId)?.name ?? 'Unknown' },
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    }));

    return {
      averageRating: total === 0 ? null : averageRating([{ rating: ratingSum / total }]),
      reviewCount: total,
      items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
