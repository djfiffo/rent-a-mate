import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { MATES_DATABASE_TOKEN } from './mates.tokens.js';
import { averageRating, modelRows, rowsByIds, toEpochMillis, type DiscoveryDatabase } from './mate-discovery.shared.js';

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
    const mate = (await modelRows(tables.Mate, { id: mateId }))[0];
    if (!mate || mate.isActive === false) throw new NotFoundException('Mate not found');

    const reviews = await modelRows(tables.Review, { mateId });
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sorted = [...reviews].sort((left, right) => toEpochMillis(right.createdAt) - toEpochMillis(left.createdAt));
    const total = sorted.length;
    const users = await rowsByIds(tables.User, 'id', reviews.map((review) => review.renterId));
    const usersById = new Map(users.map((user) => [user.id, user]));
    const items = sorted.slice((page - 1) * limit, page * limit).map((review) => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment ?? null,
      renter: { id: review.renterId, name: usersById.get(review.renterId)?.name ?? 'Unknown' },
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    }));

    return {
      averageRating: averageRating(reviews),
      reviewCount: total,
      items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
