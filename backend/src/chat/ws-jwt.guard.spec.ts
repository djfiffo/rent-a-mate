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

function createSocket(
  auth: Record<string, unknown> = {},
  query: Record<string, unknown> = {},
) {
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

  it('consumes a valid single-use socket ticket and returns the user', async () => {
    const authService = {
      consumeSocketTicket: vi.fn().mockResolvedValue({ id: 7, role: 'renter' }),
    };
    const guard = new WsJwtGuard(authService as never);
    const client = createSocket({ ticket: 'valid-ticket' });

    await expect(guard.authenticate(client as never)).resolves.toEqual({
      id: 7,
      role: 'renter',
    });
    expect(authService.consumeSocketTicket).toHaveBeenCalledWith(
      'valid-ticket',
    );
  });

  it('rejects a ticket sent only through the query string', async () => {
    const authService = { consumeSocketTicket: vi.fn() };
    const guard = new WsJwtGuard(authService as never);
    const client = createSocket({}, { ticket: 'query-ticket' });

    await expect(guard.authenticate(client as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authService.consumeSocketTicket).not.toHaveBeenCalled();
  });

  it('rejects when no ticket is present', async () => {
    const authService = { consumeSocketTicket: vi.fn() };
    const guard = new WsJwtGuard(authService as never);
    const client = createSocket();

    await expect(guard.authenticate(client as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authService.consumeSocketTicket).not.toHaveBeenCalled();
  });

  it('rejects an expired, invalid, or already-used ticket', async () => {
    const authService = {
      consumeSocketTicket: vi
        .fn()
        .mockRejectedValue(new UnauthorizedException()),
    };
    const guard = new WsJwtGuard(authService as never);
    const client = createSocket({ ticket: 'expired-ticket' });

    await expect(guard.authenticate(client as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects when the user no longer exists', async () => {
    const authService = {
      consumeSocketTicket: vi
        .fn()
        .mockResolvedValue({ id: 999, role: 'renter' }),
    };
    const guard = new WsJwtGuard(authService as never);
    const client = createSocket({ ticket: 'valid-ticket' });

    await expect(guard.authenticate(client as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a banned user', async () => {
    userRows.set(7, { id: 7, role: 'renter', isBanned: true, isActive: true });
    const authService = {
      consumeSocketTicket: vi.fn().mockResolvedValue({ id: 7, role: 'renter' }),
    };
    const guard = new WsJwtGuard(authService as never);
    const client = createSocket({ ticket: 'valid-ticket' });

    await expect(guard.authenticate(client as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an inactive/deactivated user', async () => {
    userRows.set(7, {
      id: 7,
      role: 'renter',
      isBanned: false,
      isActive: false,
    });
    const authService = {
      consumeSocketTicket: vi.fn().mockResolvedValue({ id: 7, role: 'renter' }),
    };
    const guard = new WsJwtGuard(authService as never);
    const client = createSocket({ ticket: 'valid-ticket' });

    await expect(guard.authenticate(client as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  describe('reject', () => {
    it('emits an error event and disconnects the socket', () => {
      const jwtService = { verifyAsync: vi.fn() };
      const guard = new WsJwtGuard(jwtService as never);
      const client = createSocket();

      guard.reject(client as never, 'Missing token');

      expect(client.emit).toHaveBeenCalledWith('error', {
        message: 'Missing token',
      });
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });
  });
});
