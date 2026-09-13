import { Inject, Injectable } from '@nestjs/common';
import { MATES_DATABASE_TOKEN } from './mates.tokens.js';
import type {
  MateDiscoveryPage,
  MateDiscoveryQuery,
  MateListItem,
  PaginationMeta,
} from './mate-discovery.types.js';

interface DiscoveryMate {
  id: number;
  userId: number;
  bio: string | null;
  provinceId: number;
  districtId: number;
  hourlyRate: string | number;
  profileImageUrl: string | null;
  createdAt: string | Date;
  isActive: boolean;
}

interface DiscoveryUser {
  id: number;
  name: string;
}

interface DiscoveryProvince {
  id: number;
  name: string;
}

interface DiscoveryDistrict {
  id: number;
  provinceId: number;
  name: string;
}

interface DiscoveryActivity {
  id: number;
  name: string;
}

interface DiscoveryInterest {
  id: number;
  name: string;
}

interface DiscoveryMateActivity {
  mateId: number;
  activityId: number;
}

interface DiscoveryMateInterest {
  mateId: number;
  interestId: number;
}

interface DiscoveryReview {
  mateId: number;
  rating: number;
}

interface DiscoveryDatabase {
  orm: {
    public: {
      Mate: { all(): Promise<DiscoveryMate[]> };
      User: { all(): Promise<DiscoveryUser[]> };
      Province: { all(): Promise<DiscoveryProvince[]> };
      District: { all(): Promise<DiscoveryDistrict[]> };
      Activity: { all(): Promise<DiscoveryActivity[]> };
      Interest: { all(): Promise<DiscoveryInterest[]> };
      MateActivity: { all(): Promise<DiscoveryMateActivity[]> };
      MateInterest: { all(): Promise<DiscoveryMateInterest[]> };
      Review: { all(): Promise<DiscoveryReview[]> };
    };
  };
}

const averageRating = (reviews: DiscoveryReview[]): number | null => {
  if (reviews.length === 0) return null;
  return Number((reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(2));
};

const compareNullableNumber = (left: number | null, right: number | null): number => {
  if (left === null && right === null) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return left - right;
};

@Injectable()
export class MateDiscoveryService {
  constructor(@Inject(MATES_DATABASE_TOKEN) private readonly database: DiscoveryDatabase) {}

  async list(query: MateDiscoveryQuery): Promise<MateDiscoveryPage> {
    const { Mate, User, Province, District, Activity, MateActivity, MateInterest, Review } = this.database.orm.public;
    const [mates, users, provinces, districts, activities, mateActivities, mateInterests, reviews] = await Promise.all([
      Mate.all(), User.all(), Province.all(), District.all(), Activity.all(), MateActivity.all(), MateInterest.all(), Review.all(),
    ]);
    const usersById = new Map(users.map((user) => [user.id, user]));
    const provincesById = new Map(provinces.map((province) => [province.id, province]));
    const districtsById = new Map(districts.map((district) => [district.id, district]));
    const activitiesById = new Map(activities.map((activity) => [activity.id, activity]));
    const activityIdsByMate = new Map<number, Set<number>>();
    const interestIdsByMate = new Map<number, Set<number>>();
    const reviewsByMate = new Map<number, DiscoveryReview[]>();

    for (const link of mateActivities) {
      const ids = activityIdsByMate.get(link.mateId) ?? new Set<number>();
      ids.add(link.activityId);
      activityIdsByMate.set(link.mateId, ids);
    }
    for (const link of mateInterests) {
      const ids = interestIdsByMate.get(link.mateId) ?? new Set<number>();
      ids.add(link.interestId);
      interestIdsByMate.set(link.mateId, ids);
    }
    for (const review of reviews) {
      const mateReviews = reviewsByMate.get(review.mateId) ?? [];
      mateReviews.push(review);
      reviewsByMate.set(review.mateId, mateReviews);
    }

    const rows = mates
      .filter((mate) => mate.isActive)
      .filter((mate) => {
        const user = usersById.get(mate.userId);
        return !query.q || user?.name.toLocaleLowerCase().includes(query.q.toLocaleLowerCase()) || mate.bio?.toLocaleLowerCase().includes(query.q.toLocaleLowerCase());
      })
      .filter((mate) => query.provinceId === undefined || mate.provinceId === query.provinceId)
      .filter((mate) => query.districtId === undefined || mate.districtId === query.districtId)
      .filter((mate) => query.minRate === undefined || Number(mate.hourlyRate) >= Number(query.minRate))
      .filter((mate) => query.maxRate === undefined || Number(mate.hourlyRate) <= Number(query.maxRate))
      .filter((mate) => query.activityIds.every((id) => activityIdsByMate.get(mate.id)?.has(id)))
      .filter((mate) => query.interestIds.every((id) => interestIdsByMate.get(mate.id)?.has(id)))
      .map((mate) => {
        const user = usersById.get(mate.userId);
        const province = provincesById.get(mate.provinceId);
        const district = districtsById.get(mate.districtId);
        if (!user || !province || !district) throw new Error(`Incomplete mate relation for ${mate.id}`);
        const mateReviews = reviewsByMate.get(mate.id) ?? [];
        const item: MateListItem = {
          id: mate.id,
          name: user.name,
          hourlyRate: Number(mate.hourlyRate),
          avgRating: averageRating(mateReviews),
          province: province.name,
          activities: Array.from(activityIdsByMate.get(mate.id) ?? []).map((id) => activitiesById.get(id)?.name).filter((name): name is string => name !== undefined),
          photoUrl: mate.profileImageUrl,
        };
        return { item, createdAt: new Date(mate.createdAt).getTime(), rating: item.avgRating };
      });

    rows.sort((left, right) => {
      const direction = query.sort.startsWith('-') ? -1 : 1;
      const sort = query.sort.replace('-', '');
      const result = sort === 'rating' ? compareNullableNumber(left.rating, right.rating) : sort === 'rate' ? left.item.hourlyRate - right.item.hourlyRate : left.createdAt - right.createdAt;
      return result === 0 ? left.item.id - right.item.id : result * direction;
    });

    const total = rows.length;
    const meta: PaginationMeta = { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) };
    return { items: rows.slice(query.skip, query.skip + query.limit).map(({ item }) => item), meta };
  }
}
