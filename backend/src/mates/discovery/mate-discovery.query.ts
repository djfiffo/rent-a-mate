import type { ListMatesQueryDto } from './dto/list-mates-query.dto.js';
import type { MateDiscoveryQuery } from './mate-discovery.types.js';

const DEFAULT_LIMIT = 20;
const DEFAULT_SORT = '-createdAt' as const;

export const normalizeMateDiscoveryQuery = (
  input: ListMatesQueryDto,
): MateDiscoveryQuery => {
  const page = input.page ?? 1;
  const limit = input.limit ?? DEFAULT_LIMIT;

  return {
    q: input.q || undefined,
    activityIds: input.activityId ?? [],
    interestIds: input.interestId ?? [],
    provinceId: input.provinceId,
    districtId: input.districtId,
    minRate: input.minRate,
    maxRate: input.maxRate,
    availableDate: input.availableDate,
    minRating: input.minRating,
    sort: input.sort ?? DEFAULT_SORT,
    page,
    limit,
    skip: (page - 1) * limit,
  };
};
