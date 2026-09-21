import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { MateDiscoveryService } from './mate-discovery.service.js';

const model = <T>(rows: T[]) => ({ all: async () => rows });

describe('MateDiscoveryService', () => {
  it('filters active mates by every requested activity and paginates mapped cards', async () => {
    const service = new MateDiscoveryService({
      orm: {
        public: {
          Mate: model([
            { id: 1, userId: 10, bio: 'Music and drinks', provinceId: 1, districtId: 2, hourlyRate: '350', profileImageUrl: 'one.webp', createdAt: '2026-09-01T00:00:00.000Z', isActive: true },
            { id: 2, userId: 11, bio: 'Inactive', provinceId: 1, districtId: 2, hourlyRate: '300', profileImageUrl: null, createdAt: '2026-09-02T00:00:00.000Z', isActive: false },
          ]),
          User: model([{ id: 10, name: 'Nan' }, { id: 11, name: 'Old' }]),
          Province: model([{ id: 1, name: 'Bangkok' }]),
          District: model([{ id: 2, provinceId: 1, name: 'Watthana' }]),
          Activity: model([{ id: 2, name: 'drinking' }, { id: 5, name: 'music' }]),
          Interest: model([]),
          MateActivity: model([{ mateId: 1, activityId: 2 }, { mateId: 1, activityId: 5 }]),
          MateInterest: model([]),
          Review: model([{ mateId: 1, rating: 5 }, { mateId: 1, rating: 4 }]),
        },
      },
    });

    await expect(service.list({ q: 'nan', activityIds: [2, 5], interestIds: [], sort: '-rating', page: 1, limit: 12, skip: 0 })).resolves.toEqual({
      items: [{ id: 1, name: 'Nan', hourlyRate: 350, avgRating: 4.5, reviewCount: 2, province: 'Bangkok', district: 'Watthana', activities: ['drinking', 'music'], photoUrl: 'one.webp' }],
      meta: { page: 1, limit: 12, total: 1, totalPages: 1 },
    });
  });
});
