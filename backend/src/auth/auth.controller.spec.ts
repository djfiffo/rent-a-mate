import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('AuthController', () => {
  it('delegates logout to AuthService with only the refresh token', async () => {
    const service = {
      logout: vi.fn().mockResolvedValue({
        status: 'success',
        message: 'Logged out',
        data: null,
      }),
    };
    const controller = new AuthController(service as never);

    await expect(controller.logout({ refreshToken: 'refresh-token' })).resolves.toEqual({
      status: 'success',
      message: 'Logged out',
      data: null,
    });
    expect(service.logout).toHaveBeenCalledWith('refresh-token');
  });

  it('does not require JwtAuthGuard for logout', () => {
    const guards = Reflect.getMetadata('__guards__', AuthController.prototype.logout);

    expect(guards).toBeUndefined();
  });

  it('keeps JwtAuthGuard on /auth/me', () => {
    const guards = Reflect.getMetadata('__guards__', AuthController.prototype.me) as Array<
      new (...args: never[]) => unknown
    >;

    expect(guards).toContain(JwtAuthGuard);
  });
});
