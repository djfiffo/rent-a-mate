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

  it('does not persist a client-provided storage key', async () => {
    const create = vi.fn().mockResolvedValue({
      id: 1,
      mateId: mate.id,
      url: 'https://cdn.example/photo.jpg',
      storageKey: null,
      sortOrder: 0,
    });
    const db = {
      orm: { public: {
        Mate: { where: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(mate) }) },
        MatePhoto: { where: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }), create },
      } },
    } as never;
    const service = new MatesService(db, { store: vi.fn(), remove: vi.fn() });

    await service.addPhoto(7, { url: 'https://cdn.example/photo.jpg', storageKey: 'mates/999/foreign.jpg' } as never);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ storageKey: null }));
  });

  it('cleans up an uploaded object when the photo row cannot be created', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const db = {
      orm: { public: {
        Mate: { where: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(mate) }) },
        MatePhoto: {
          where: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }),
          create: vi.fn().mockRejectedValue({ code: 'P2002' }),
        },
      } },
    } as never;
    const storage = {
      store: vi.fn().mockResolvedValue({ url: 'https://cdn.example/photo.jpg', storageKey: 'mates/11/new.jpg' }),
      remove,
    };
    const service = new MatesService(db, storage);

    await expect(service.addPhoto(7, {}, {
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
      mimetype: 'image/jpeg',
    })).rejects.toThrow('Mate gallery slot is no longer available');
    expect(remove).toHaveBeenCalledWith('mates/11/new.jpg');
  });

  it('does not delete a storage key outside the mate namespace', async () => {
    const remove = vi.fn();
    const deletePhoto = vi.fn().mockResolvedValue(undefined);
    const db = {
      orm: { public: {
        Mate: { where: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(mate) }) },
        MatePhoto: {
          where: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ id: 4, mateId: mate.id, storageKey: 'mates/999/foreign.jpg' }),
            delete: deletePhoto,
          }),
        },
      } },
    } as never;
    const service = new MatesService(db, { store: vi.fn(), remove });

    await service.removePhoto(7, 4);

    expect(remove).not.toHaveBeenCalled();
    expect(deletePhoto).toHaveBeenCalled();
  });
});
