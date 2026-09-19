import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const userRows = new Map<number, Record<string, unknown>>();

vi.mock('../prisma/db.js', () => ({
  db: {
    orm: {
      public: {
        User: {
          where: (filter: { id: number }) => ({
            first: async () => userRows.get(filter.id) ?? null,
          }),
        },
      },
    },
  },
}));

const { WsJwtGuard } = await import('./ws-jwt.guard.js');

function createSocket(auth: Record<string, unknown> = {}, query: Record<string, unknown> = {}) {
  return {
    id: 'socket-1',
    handshake: { auth, query },
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
}

describe('WsJwtGuard', () => {
  beforeEach(() => {
    userRows.clear();
    userRows.set(7, { id: 7, role: 'renter', isBanned: false, isActive: true });
  });

  it('authenticates a valid access token and returns the user', async () => {
    const jwtService = { verifyAsync: vi.fn().mockResolvedValue({ sub: 7, role: 'renter', type: 'access' }) };
    const guard = new WsJwtGuard(jwtService as never);
    const client = createSocket({ token: 'valid-token' });

    await expect(guard.authenticate(client as never)).resolves.toEqual({ id: 7, role: 'renter' });
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-token');
  });

  it('falls back to handshake.query.token when handshake.auth.token is absent', async () => {
    const jwtService = { verifyAsync: vi.fn().mockResolvedValue({ sub: 7, role: 'renter', type: 'access' }) };
    const guard = new WsJwtGuard(jwtService as never);
    const client = createSocket({}, { token: 'query-token' });

    await expect(guard.authenticate(client as never)).resolves.toEqual({ id: 7, role: 'renter' });
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('query-token');
  });

  it('rejects when no token is present', async () => {
    const jwtService = { verifyAsync: vi.fn() };
    const guard = new WsJwtGuard(jwtService as never);
    const client = createSocket();

    await expect(guard.authenticate(client as never)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects an expired/invalid token', async () => {
    const jwtService = { verifyAsync: vi.fn().mockRejectedValue(new Error('jwt expired')) };
    const guard = new WsJwtGuard(jwtService as never);
    const client = createSocket({ token: 'expired-token' });

    await expect(guard.authenticate(client as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a refresh token used where an access token is required', async () => {
    const jwtService = { verifyAsync: vi.fn().mockResolvedValue({ sub: 7, role: 'renter', type: 'refresh' }) };
    const guard = new WsJwtGuard(jwtService as never);
    const client = createSocket({ token: 'refresh-token' });

    await expect(guard.authenticate(client as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the user no longer exists', async () => {
    const jwtService = { verifyAsync: vi.fn().mockResolvedValue({ sub: 999, role: 'renter', type: 'access' }) };
    const guard = new WsJwtGuard(jwtService as never);
    const client = createSocket({ token: 'valid-token' });

    await expect(guard.authenticate(client as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a banned user', async () => {
    userRows.set(7, { id: 7, role: 'renter', isBanned: true, isActive: true });
    const jwtService = { verifyAsync: vi.fn().mockResolvedValue({ sub: 7, role: 'renter', type: 'access' }) };
    const guard = new WsJwtGuard(jwtService as never);
    const client = createSocket({ token: 'valid-token' });

    await expect(guard.authenticate(client as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an inactive/deactivated user', async () => {
    userRows.set(7, { id: 7, role: 'renter', isBanned: false, isActive: false });
    const jwtService = { verifyAsync: vi.fn().mockResolvedValue({ sub: 7, role: 'renter', type: 'access' }) };
    const guard = new WsJwtGuard(jwtService as never);
    const client = createSocket({ token: 'valid-token' });

    await expect(guard.authenticate(client as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  describe('reject', () => {
    it('emits an error event and disconnects the socket', () => {
      const jwtService = { verifyAsync: vi.fn() };
      const guard = new WsJwtGuard(jwtService as never);
      const client = createSocket();

      guard.reject(client as never, 'Missing token');

      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Missing token' });
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });
  });
});
