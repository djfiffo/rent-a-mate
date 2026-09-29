import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Temporal } from '@js-temporal/polyfill';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsService } from './notifications.service.js';
import type {
  NotificationDatabase,
  NotificationFilter,
  NotificationRecord,
} from './notifications.types.js';

const baseNotification: NotificationRecord = {
  id: 1,
  userId: 7,
  type: 'booking_requested',
  message: 'You have a new booking request',
  bookingId: 42,
  isRead: false,
  createdAt: Temporal.Instant.from('2026-09-10T00:00:00.000Z'),
};

function createFixture(seed: NotificationRecord[] = [baseNotification]) {
  const rows = seed.map((row) => ({ ...row }));

  const matches = (row: NotificationRecord, filters: NotificationFilter) =>
    Object.entries(filters as Record<string, unknown>).every(
      ([key, value]) => (row as never)[key] === value,
    );

  const makeQuery = (filters: NotificationFilter) => ({
    where: vi.fn((moreFilters: NotificationFilter) =>
      makeQuery({
        ...(filters as object),
        ...(moreFilters as object),
      } as NotificationFilter),
    ),
    first: vi.fn(async () => rows.find((row) => matches(row, filters)) ?? null),
    all: vi.fn(async () => rows.filter((row) => matches(row, filters))),
    update: vi.fn(async (data: Partial<NotificationRecord>) => {
      const target = rows.find((row) => matches(row, filters));
      if (!target) return null;
      Object.assign(target, data);
      return { ...target };
    }),
    updateAndCount: vi.fn(async (data: Partial<NotificationRecord>) => {
      const targets = rows.filter((row) => matches(row, filters));
      targets.forEach((row) => Object.assign(row, data));
      return targets.length;
    }),
  });

  const where = vi.fn((filters: NotificationFilter) => makeQuery(filters));
  const create = vi.fn(async (data: Record<string, unknown>) => {
    const created: NotificationRecord = {
      id: rows.length + 1,
      userId: data['userId'] as number,
      type: data['type'] as NotificationRecord['type'],
      message: data['message'] as string,
      bookingId: (data['bookingId'] as number | null) ?? null,
      isRead: false,
      createdAt: Temporal.Now.instant(),
    };
    rows.push(created);
    return created;
  });

  const database: NotificationDatabase = {
    orm: { public: { Notification: { where, create } as never } },
  };
  return { service: new NotificationsService(database), where, create, rows };
}

describe('NotificationsService', () => {
  let fixture: ReturnType<typeof createFixture>;

  beforeEach(() => {
    fixture = createFixture();
  });

  it('creates a notification against the injected database by default', async () => {
    const created = await fixture.service.create({
      userId: 7,
      type: 'booking_confirmed',
      message: 'Your booking was confirmed',
      bookingId: 42,
    });

    expect(created.userId).toBe(7);
    expect(created.type).toBe('booking_confirmed');
    expect(fixture.create).toHaveBeenCalled();
  });

  it('creates a notification through an externally supplied writer (e.g. a transaction)', async () => {
    const create = vi.fn(
      async (data: Record<string, unknown>) =>
        ({ ...baseNotification, ...data }) as NotificationRecord,
    );
    const writer = { orm: { public: { Notification: { create } } } };

    await fixture.service.create(
      { userId: 9, type: 'booking_declined', message: 'Declined' },
      writer,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 9,
        type: 'booking_declined',
        message: 'Declined',
      }),
    );
    expect(fixture.create).not.toHaveBeenCalled();
  });

  it('lists the current user notifications, newest first', async () => {
    fixture = createFixture([
      {
        ...baseNotification,
        id: 1,
        createdAt: Temporal.Instant.from('2026-09-10T00:00:00.000Z'),
      },
      {
        ...baseNotification,
        id: 2,
        createdAt: Temporal.Instant.from('2026-09-11T00:00:00.000Z'),
      },
    ]);

    const notifications = await fixture.service.findMine(7);
    expect(notifications.map((n) => n.id)).toEqual([2, 1]);
  });

  it('filters to unread notifications only when requested', async () => {
    fixture = createFixture([
      { ...baseNotification, id: 1, isRead: true },
      { ...baseNotification, id: 2, isRead: false },
    ]);

    const notifications = await fixture.service.findMine(7, true);
    expect(notifications.map((n) => n.id)).toEqual([2]);
  });

  it('marks a notification as read for its owner', async () => {
    const updated = await fixture.service.markRead(7, 1);
    expect(updated.isRead).toBe(true);
  });

  it('is idempotent when the notification is already read', async () => {
    fixture = createFixture([{ ...baseNotification, isRead: true }]);
    const updated = await fixture.service.markRead(7, 1);
    expect(updated.isRead).toBe(true);
  });

  it('throws NotFoundException when the notification does not exist', async () => {
    await expect(fixture.service.markRead(7, 999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws ForbiddenException when marking another user notification as read', async () => {
    await expect(fixture.service.markRead(999, 1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('marks all of the current user unread notifications as read', async () => {
    fixture = createFixture([
      { ...baseNotification, id: 1, isRead: false },
      { ...baseNotification, id: 2, isRead: false },
      { ...baseNotification, id: 3, userId: 99, isRead: false },
    ]);

    const result = await fixture.service.markAllRead(7);
    expect(result).toEqual({ updated: 2 });
    expect(
      fixture.rows.filter((row) => row.userId === 7 && row.isRead),
    ).toHaveLength(2);
  });
});
