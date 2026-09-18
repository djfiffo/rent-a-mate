import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { MatesService } from './mates.service.js';

const mate = {
  id: 11,
  userId: 7,
  age: 25,
  bio: 'Friendly',
  hourlyRate: 350,
  provinceId: 1,
  districtId: 2,
  isActive: true,
  deactiveAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function database() {
  const updated = { ...mate, isActive: false, deactiveAt: '2026-09-12T00:00:00.000Z' };
  const mateQuery = {
    first: vi.fn().mockResolvedValue(mate),
    update: vi.fn().mockResolvedValue(updated),
  };
  const emptyQuery = { first: vi.fn().mockResolvedValue({ id: 7, name: 'Nan' }), all: vi.fn().mockResolvedValue([]) };
  const db = {
    transaction: vi.fn(async (callback: (tx: typeof db) => unknown) => callback(db)),
    orm: {
      public: {
        Mate: { where: vi.fn().mockReturnValue(mateQuery) },
        User: { where: vi.fn().mockReturnValue(emptyQuery) },
        Province: { where: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue({ id: 1, name: 'Bangkok' }) }) },
        District: { where: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue({ id: 2, provinceId: 1, name: 'Watthana' }) }) },
        MateActivity: { where: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }) },
        MateInterest: { where: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }) },
        MatePhoto: { where: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }) },
      },
    },
  } as never;
  return { db, mateQuery, updated };
}

describe('MatesService', () => {
  it('deactivates a mate without deleting the profile', async () => {
    const { db, mateQuery, updated } = database();
    const service = new MatesService(db);

    const result = await service.deactivate(7);

    expect(mateQuery.update).toHaveBeenCalledWith(expect.objectContaining({ isActive: false, deactiveAt: expect.anything() }));
    expect(result.isActive).toBe(false);
    expect(result.deactivatedAt).toBe(updated.deactiveAt);
  });
});
