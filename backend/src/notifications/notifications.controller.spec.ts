import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { NotificationsController } from './notifications.controller.js';

const notification = {
  id: 1,
  userId: 7,
  type: 'booking_requested' as const,
  message: 'You have a new booking request',
  bookingId: 42,
  isRead: false,
  createdAt: '2026-09-10T00:00:00.000Z',
};

describe('NotificationsController', () => {
  it('wraps list, markRead, and markAllRead in the success envelope', async () => {
    const service = {
      findMine: vi.fn().mockResolvedValue([notification]),
      markRead: vi.fn().mockResolvedValue({ ...notification, isRead: true }),
      markAllRead: vi.fn().mockResolvedValue({ updated: 3 }),
    };
    const controller = new NotificationsController(service as never);
    const user = { id: 7, role: 'renter' as const };

    await expect(controller.list(user, {})).resolves.toEqual({
      status: 'success',
      message: 'Notifications retrieved',
      data: { notifications: [notification] },
    });
    expect(service.findMine).toHaveBeenCalledWith(7, false);

    await expect(
      controller.list(user, { unreadOnly: true }),
    ).resolves.toMatchObject({
      data: { notifications: [notification] },
    });
    expect(service.findMine).toHaveBeenCalledWith(7, true);

    await expect(controller.markRead(user, 1)).resolves.toEqual({
      status: 'success',
      message: 'Notification marked as read',
      data: { notification: { ...notification, isRead: true } },
    });

    await expect(controller.markAllRead(user)).resolves.toEqual({
      status: 'success',
      message: 'Notifications marked as read',
      data: { updated: 3 },
    });
  });

  it('rejects an unauthenticated caller before calling the service', async () => {
    const service = { findMine: vi.fn() };
    const controller = new NotificationsController(service as never);

    await expect(controller.list(undefined, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(service.findMine).not.toHaveBeenCalled();
  });
});
