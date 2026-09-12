import 'reflect-metadata';
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { UsersController } from './users.controller.js';
import type { SafeUser } from './users.types.js';

const profile: SafeUser = {
  id: 7,
  name: 'Nok',
  email: 'user@example.com',
  role: 'renter',
  createdAt: new Date('2026-09-07T00:00:00.000Z'),
  updatedAt: new Date('2026-09-07T00:00:00.000Z'),
};

describe('UsersController', () => {
  it('wraps the profile in the shared success envelope', async () => {
    const service = { getProfile: vi.fn().mockResolvedValue(profile) } as never;
    const controller = new UsersController(service);

    await expect(controller.getProfile({ id: 7 })).resolves.toEqual({
      status: 'success',
      message: 'Profile retrieved',
      data: profile,
    });
  });

  it('rejects requests without an authenticated user', async () => {
    const service = { getProfile: vi.fn() } as never;
    const controller = new UsersController(service);

    await expect(controller.getProfile()).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.getProfile).not.toHaveBeenCalled();
  });

  it('protects all user routes with the JWT guard', () => {
    const guards = Reflect.getMetadata('__guards__', UsersController) as Array<
      new (...args: never[]) => unknown
    >;

    expect(guards).toContain(JwtAuthGuard);
  });
});
