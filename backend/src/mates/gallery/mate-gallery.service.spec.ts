import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { MateGalleryService } from './mate-gallery.service.js';

const mate = { id: 11, userId: 7, isActive: true };

describe('MateGalleryService', () => {
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
    const service = new MateGalleryService(db, { store: vi.fn(), remove: vi.fn() });

    await service.addPhoto(7, {
      url: 'https://cdn.example/photo.jpg',
      storageKey: 'mates/999/foreign.jpg',
    } as never);

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
      store: vi.fn().mockResolvedValue({
        url: 'https://cdn.example/photo.jpg',
        storageKey: 'mates/11/new.jpg',
      }),
      remove,
    };
    const service = new MateGalleryService(db, storage);

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
            first: vi.fn().mockResolvedValue({
              id: 4,
              mateId: mate.id,
              storageKey: 'mates/999/foreign.jpg',
            }),
            delete: deletePhoto,
          }),
        },
      } },
    } as never;
    const service = new MateGalleryService(db, { store: vi.fn(), remove });

    await service.removePhoto(7, 4);

    expect(remove).not.toHaveBeenCalled();
    expect(deletePhoto).toHaveBeenCalled();
  });
});
