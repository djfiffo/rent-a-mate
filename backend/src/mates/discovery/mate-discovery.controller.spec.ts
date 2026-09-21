import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { MateDiscoveryController } from './mate-discovery.controller.js';

describe('MateDiscoveryController', () => {
  it('returns the shared success envelope for a normalized query', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    const controller = new MateDiscoveryController({ list } as never);

    await expect(controller.list({ page: 1, limit: 20 })).resolves.toEqual({
      status: 'success',
      message: 'OK',
      data: { items: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      },
    });
    expect(list).toHaveBeenCalledWith({ activityIds: [], interestIds: [], sort: '-createdAt', page: 1, limit: 20, skip: 0 });
  });
});
