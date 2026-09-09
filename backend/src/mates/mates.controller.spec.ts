import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MatesController } from './mates.controller.js';

const profile = {
  id: 42,
  user: { id: 7, name: 'Nan' },
  age: 25,
  bio: 'Friendly',
  hourlyRate: 350,
  province: { id: 1, name: 'Bangkok' },
  district: { id: 4, name: 'Watthana' },
  activities: [{ id: 2, name: 'Drinking' }],
  interests: [{ id: 1, name: 'Music' }],
  createdAt: '2026-09-10T00:00:00.000Z',
  updatedAt: '2026-09-10T00:00:00.000Z',
};

describe('MatesController', () => {
  it('wraps create, retrieve, and update in the success envelope', async () => {
    const service = {
      create: vi.fn().mockResolvedValue(profile),
      getProfile: vi.fn().mockResolvedValue(profile),
      update: vi.fn().mockResolvedValue(profile),
    };
    const controller = new MatesController(service as never);
    const user = { id: 7, role: 'mate' as const };

    await expect(controller.create(user, {} as never)).resolves.toEqual({
      status: 'success',
      message: 'Mate profile created',
      data: { mate: profile },
    });
    await expect(controller.getProfile(user)).resolves.toMatchObject({ data: { mate: profile } });
    await expect(controller.update(user, {} as never)).resolves.toMatchObject({ data: { mate: profile } });
  });

  it('rejects missing and non-mate identities before calling the service', async () => {
    const service = { getProfile: vi.fn() };
    const controller = new MatesController(service as never);

    await expect(controller.getProfile(undefined)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.getProfile({ id: 7, role: 'renter' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.getProfile).not.toHaveBeenCalled();
  });
});
