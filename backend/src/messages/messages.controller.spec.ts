import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MessagesController } from './messages.controller.js';

const message = {
  id: 1,
  bookingId: 2,
  senderId: 7,
  content: 'Hello',
  readAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('MessagesController', () => {
  const user = { id: 7, role: 'renter' as const };

  it('wraps list() in the success envelope', async () => {
    const paginated = {
      items: [message],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    };
    const service = { list: vi.fn().mockResolvedValue(paginated) };
    const controller = new MessagesController(service as never, {} as never);

    await expect(controller.list(user, 2, {})).resolves.toEqual({
      status: 'success',
      message: 'OK',
      data: paginated,
    });
    expect(service.list).toHaveBeenCalledWith(user, 2, {});
  });

  it('rejects list() for an unauthenticated caller before calling the service', async () => {
    const service = { list: vi.fn() };
    const controller = new MessagesController(service as never, {} as never);

    await expect(controller.list(undefined, 2, {})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(service.list).not.toHaveBeenCalled();
  });

  it('wraps create() in the success envelope', async () => {
    const service = { create: vi.fn().mockResolvedValue(message) };
    const events = { publishCreated: vi.fn() };
    const controller = new MessagesController(
      service as never,
      events as never,
    );

    await expect(
      controller.create(user, 2, { content: 'Hello' }),
    ).resolves.toEqual({
      status: 'success',
      message: 'Message sent',
      data: message,
    });
    expect(service.create).toHaveBeenCalledWith(user, 2, { content: 'Hello' });
    expect(events.publishCreated).toHaveBeenCalledOnce();
    expect(events.publishCreated).toHaveBeenCalledWith(message);
  });

  it('rejects create() for an unauthenticated caller before calling the service', async () => {
    const service = { create: vi.fn() };
    const events = { publishCreated: vi.fn() };
    const controller = new MessagesController(
      service as never,
      events as never,
    );

    await expect(
      controller.create(undefined, 2, { content: 'Hello' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.create).not.toHaveBeenCalled();
    expect(events.publishCreated).not.toHaveBeenCalled();
  });
});
