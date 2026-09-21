import type { PaginationMeta } from '../../shared/types/pagination.js';

export type MateSort = 'rating' | '-rating' | 'rate' | '-rate' | 'createdAt' | '-createdAt';

export interface MateDiscoveryQuery {
  q?: string;
  activityIds: number[];
  interestIds: number[];
  provinceId?: number;
  districtId?: number;
  minRate?: string;
  maxRate?: string;
  availableDate?: string;
  minRating?: number;
  sort: MateSort;
  page: number;
  limit: number;
  skip: number;
}

export interface MateListItem {
  id: number;
  name: string;
  hourlyRate: number;
  avgRating: number | null;
  reviewCount: number;
  province: string;
  district: string;
  activities: string[];
  photoUrl: string | null;
}

export interface MateDiscoveryPage {
  items: MateListItem[];
  meta: PaginationMeta;
}
