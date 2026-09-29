import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { MATES_DATABASE_TOKEN } from '../internal/mates.tokens.js';
import {
  averageRating,
  modelRows,
  rowsByIds,
  type DiscoveryDatabase,
} from '../discovery/mate-discovery.shared.js';
import { requirePublicMate } from '../internal/mate-visibility.js';

export interface PublicMateDetail {
  id: number;
  user: { id: number; name: string };
  age: number | null;
  bio: string | null;
  hourlyRate: number;
  province: { id: number; name: string };
  district: { id: number; name: string };
  activities: Array<{ id: number; name: string }>;
  interests: Array<{ id: number; name: string }>;
  photos: Array<{ id: number; url: string; sortOrder: number }>;
  avgRating: number | null;
  reviewCount: number;
  isActive: boolean;
  createdAt: unknown;
  updatedAt: unknown;
}

@Injectable()
export class MateDetailService {
  constructor(
    @Inject(MATES_DATABASE_TOKEN) private readonly database: DiscoveryDatabase,
  ) {}

  async findOne(mateId: number): Promise<PublicMateDetail> {
    const tables = this.database.orm.public;
    const { mate, owner } = await requirePublicMate(this.database, mateId);

    const [province, district, activityLinks, interestLinks, photos, reviews] =
      await Promise.all([
        modelRows(tables.Province, { id: mate.provinceId }).then(
          (rows) => rows[0],
        ),
        modelRows(tables.District, { id: mate.districtId }).then(
          (rows) => rows[0],
        ),
        modelRows(tables.MateActivity, { mateId }),
        modelRows(tables.MateInterest, { mateId }),
        modelRows(tables.MatePhoto, { mateId }),
        modelRows(tables.Review, { mateId }),
      ]);

    if (!province || !district) {
      throw new NotFoundException('Mate not found');
    }

    const [activities, interests] = await Promise.all([
      rowsByIds(
        tables.Activity,
        'id',
        activityLinks.map((link) => link.activityId),
      ),
      rowsByIds(
        tables.Interest,
        'id',
        interestLinks.map((link) => link.interestId),
      ),
    ]);
    const activityById = new Map(
      activities.map((activity) => [activity.id, activity]),
    );
    const interestById = new Map(
      interests.map((interest) => [interest.id, interest]),
    );

    return {
      id: mate.id,
      user: { id: owner.id, name: owner.name },
      age: mate.age ?? null,
      bio: mate.bio ?? null,
      hourlyRate: Number(mate.hourlyRate),
      province: { id: province.id, name: province.name },
      district: { id: district.id, name: district.name },
      activities: activityLinks
        .map((link) => activityById.get(link.activityId))
        .filter(
          (activity): activity is { id: number; name: string } =>
            activity !== undefined,
        )
        .map(({ id, name }) => ({ id, name })),
      interests: interestLinks
        .map((link) => interestById.get(link.interestId))
        .filter(
          (interest): interest is { id: number; name: string } =>
            interest !== undefined,
        )
        .map(({ id, name }) => ({ id, name })),
      photos: photos
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((photo) => ({
          id: photo.id,
          url: photo.url,
          sortOrder: photo.sortOrder,
        })),
      avgRating: averageRating(reviews),
      reviewCount: reviews.length,
      isActive: true,
      createdAt: mate.createdAt,
      updatedAt: mate.updatedAt,
    };
  }
}
