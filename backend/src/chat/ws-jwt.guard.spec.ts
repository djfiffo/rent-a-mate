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

function socketTicketPayload(overrides: Record<string, unknown> = {}) {
  return {
    sub: 7,
    role: 'renter',
    type: 'socket_ticket',
    jti: 'ticket-1',
    exp: Math.floor(Date.now() / 1000) + 30,
    ...overrides,
  };
}

describe('WsJwtGuard', () => {
  beforeEach(() => {
    userRows.clear();
    userRows.set(7, { id: 7, role: 'renter', isBanned: false, isActive: true });
  });

  it('authenticates a valid socket ticket and returns the user', async () => {
    const jwtService = { verifyAsync: vi.fn().mockResolvedValue(socketTicketPayload()) };
    const guard = new WsJwtGuard(jwtService as never);
    const client = createSocket({ ticket: 'valid-ticket' });

    await expect(guard.authenticate(client as never)).resolves.toEqual({ id: 7, role: 'renter' });
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-ticket');
  });

  it('rejects a ticket sent only through handshake.query', async () => {
    const jwtService = { verifyAsync: vi.fn().mockResolvedValue(socketTicketPayload()) };
    const guard = new WsJwtGuard(jwtService as never);
    const client = createSocket({}, { ticket: 'query-ticket' });

    await expect(guard.authenticate(client as never)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects when no ticket is present', async () => {
    const jwtService = { verifyAsync: vi.fn() };
    const guard = new WsJwtGuard(jwtService as never);
    const client = createSocket();

    await expect(guard.authenticate(client as never)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects an expired or invalid ticket', async () => {
    const jwtService = { verifyAsync: vi.fn().mockRejectedValue(new Error('jwt expired')) };
    const guard = new WsJwtGuard(jwtService as never);
    const client = createSocket({ ticket: 'expired-ticket' });

    await expect(guard.authenticate(client as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an access token used where a socket ticket is required', async () => {
    const jwtService = {
      verifyAsync: vi.fn().mockResolvedValue(socketTicketPayload({ type: 'access' })),
    };
    const guard = new WsJwtGuard(jwtService as never);
    const client = createSocket({ ticket: 'access-token' });

    await expect(guard.authenticate(client as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('consumes each ticket once', async () => {
    const jwtService = { verifyAsync: vi.fn().mockResolvedValue(socketTicketPayload()) };
    const guard = new WsJwtGuard(jwtService as never);

    await expect(guard.authenticate(createSocket({ ticket: 'one-use' }) as never)).resolves.toEqual({
      id: 7,
      role: 'renter',
    });
    await expect(guard.authenticate(createSocket({ ticket: 'one-use' }) as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects when the user no longer exists', async () => {
    const jwtService = {
      verifyAsync: vi.fn().mockResolvedValue(socketTicketPayload({ sub: 999, jti: 'ticket-user-missing' })),
    };
    const guard = new WsJwtGuard(jwtService as never);

    await expect(guard.authenticate(createSocket({ ticket: 'valid-ticket' }) as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a banned user', async () => {
    userRows.set(7, { id: 7, role: 'renter', isBanned: true, isActive: true });
    const jwtService = { verifyAsync: vi.fn().mockResolvedValue(socketTicketPayload()) };
    const guard = new WsJwtGuard(jwtService as never);

    await expect(guard.authenticate(createSocket({ ticket: 'valid-ticket' }) as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an inactive/deactivated user', async () => {
    userRows.set(7, { id: 7, role: 'renter', isBanned: false, isActive: false });
    const jwtService = { verifyAsync: vi.fn().mockResolvedValue(socketTicketPayload()) };
    const guard = new WsJwtGuard(jwtService as never);

    await expect(guard.authenticate(createSocket({ ticket: 'valid-ticket' }) as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  describe('reject', () => {
    it('emits an error event and disconnects the socket', () => {
      const guard = new WsJwtGuard({ verifyAsync: vi.fn() } as never);
      const client = createSocket();

      guard.reject(client as never, 'Missing socket ticket');

      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Missing socket ticket' });
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });
  });
});
