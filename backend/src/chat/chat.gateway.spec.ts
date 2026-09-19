import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatGateway } from './chat.gateway.js';
import { WsJwtGuard } from './ws-jwt.guard.js';

const message = {
  id: 1,
  bookingId: 2,
  senderId: 7,
  content: 'Hello',
  readAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function createSocket(data: Record<string, unknown> = {}) {
  return {
    id: 'socket-1',
    data,
    join: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn(),
    to: vi.fn().mockReturnValue({ emit: vi.fn() }),
    emit: vi.fn(),
    disconnect: vi.fn(),
    handshake: { auth: {}, query: {} },
  };
}

function createServer() {
  return { to: vi.fn().mockReturnValue({ emit: vi.fn() }) };
}

describe('ChatGateway', () => {
  const user = { id: 7, role: 'renter' as const };
  let messagesService: {
    assertParticipant: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    markRead: ReturnType<typeof vi.fn>;
  };
  let gateway: ChatGateway;
  let server: ReturnType<typeof createServer>;

  beforeEach(() => {
    messagesService = {
      assertParticipant: vi.fn().mockResolvedValue({ booking: {}, mate: {}, recipientId: 5 }),
      create: vi.fn().mockResolvedValue(message),
      markRead: vi.fn().mockResolvedValue({ updatedCount: 3 }),
    };
    gateway = new ChatGateway(messagesService as never, {} as WsJwtGuard);
    server = createServer();
    gateway.server = server as never;
  });

  describe('handleConnection', () => {
    it('attaches the authenticated user to client.data and does not reject', async () => {
      const wsJwtGuard = { authenticate: vi.fn().mockResolvedValue(user), reject: vi.fn() };
      gateway = new ChatGateway(messagesService as never, wsJwtGuard as never);
      const client = createSocket();

      await gateway.handleConnection(client as never);

      expect(client.data['user']).toEqual(user);
      expect(wsJwtGuard.reject).not.toHaveBeenCalled();
    });

    it('rejects the connection when authentication fails', async () => {
      const wsJwtGuard = {
        authenticate: vi.fn().mockRejectedValue(new Error('Missing token')),
        reject: vi.fn(),
      };
      gateway = new ChatGateway(messagesService as never, wsJwtGuard as never);
      const client = createSocket();

      await gateway.handleConnection(client as never);

      expect(wsJwtGuard.reject).toHaveBeenCalledWith(client, 'Missing token');
      expect(client.data['user']).toBeUndefined();
    });
  });

  describe('handleJoinBooking', () => {
    it('joins the booking room after a successful assertParticipant check', async () => {
      const client = createSocket({ user });

      const ack = await gateway.handleJoinBooking(client as never, { bookingId: 2 });

      expect(messagesService.assertParticipant).toHaveBeenCalledWith(user, 2);
      expect(client.join).toHaveBeenCalledWith('booking:2');
      expect(ack).toEqual({ ok: true, data: undefined });
    });

    it('returns an ack error instead of throwing when the caller is not a participant', async () => {
      messagesService.assertParticipant.mockRejectedValue(new NotFoundException('Booking not found'));
      const client = createSocket({ user });

      const ack = await gateway.handleJoinBooking(client as never, { bookingId: 2 });

      expect(ack).toEqual({ ok: false, error: 'Booking not found' });
      expect(client.join).not.toHaveBeenCalled();
    });
  });

  describe('handleLeaveBooking', () => {
    it('leaves the room without checking participation', () => {
      const client = createSocket({ user });

      const ack = gateway.handleLeaveBooking(client as never, { bookingId: 2 });

      expect(client.leave).toHaveBeenCalledWith('booking:2');
      expect(messagesService.assertParticipant).not.toHaveBeenCalled();
      expect(ack).toEqual({ ok: true, data: undefined });
    });
  });

  describe('handleSendMessage', () => {
    it('creates the message via MessagesService and broadcasts it to the whole room', async () => {
      const client = createSocket({ user });

      const ack = await gateway.handleSendMessage(client as never, { bookingId: 2, content: 'Hello' });

      expect(messagesService.create).toHaveBeenCalledWith(user, 2, { content: 'Hello' });
      expect(server.to).toHaveBeenCalledWith('booking:2');
      expect(server.to('booking:2').emit).toHaveBeenCalledWith('new_message', message);
      expect(ack).toEqual({ ok: true, data: message });
    });

    it('returns an ack error (not a broadcast) when sending is not allowed', async () => {
      messagesService.create.mockRejectedValue(new UnprocessableEntityException('MESSAGE_NOT_ALLOWED'));
      const client = createSocket({ user });

      const ack = await gateway.handleSendMessage(client as never, { bookingId: 2, content: 'Hello' });

      expect(ack).toEqual({ ok: false, error: 'MESSAGE_NOT_ALLOWED' });
      expect(server.to).not.toHaveBeenCalled();
    });
  });

  describe('handleTyping', () => {
    it('broadcasts typing to everyone else in the room, not back to the sender', async () => {
      const client = createSocket({ user });

      const ack = await gateway.handleTyping(client as never, { bookingId: 2, isTyping: true });

      expect(messagesService.assertParticipant).toHaveBeenCalledWith(user, 2);
      expect(client.to).toHaveBeenCalledWith('booking:2');
      expect(client.to('booking:2').emit).toHaveBeenCalledWith('typing', {
        bookingId: 2,
        userId: 7,
        isTyping: true,
      });
      expect(ack).toEqual({ ok: true, data: undefined });
    });
  });

  describe('handleMarkRead', () => {
    it('marks messages read and broadcasts messages_read to the room', async () => {
      const client = createSocket({ user });

      const ack = await gateway.handleMarkRead(client as never, { bookingId: 2 });

      expect(messagesService.markRead).toHaveBeenCalledWith(user, 2);
      expect(server.to).toHaveBeenCalledWith('booking:2');
      expect(server.to('booking:2').emit).toHaveBeenCalledWith('messages_read', {
        bookingId: 2,
        readerId: 7,
        updatedCount: 3,
      });
      expect(ack).toEqual({ ok: true, data: { updatedCount: 3 } });
    });
  });

  describe('unauthenticated client', () => {
    it('returns an ack error instead of throwing when client.data.user is missing', async () => {
      const client = createSocket();

      const ack = await gateway.handleSendMessage(client as never, { bookingId: 2, content: 'Hello' });

      expect(ack).toEqual({ ok: false, error: 'Not authenticated' });
      expect(messagesService.create).not.toHaveBeenCalled();
    });
  });
});
