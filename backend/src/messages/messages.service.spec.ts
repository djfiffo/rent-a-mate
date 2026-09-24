import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { NotificationDatabase } from '../notifications/notifications.types.js';
import { MessagesService } from './messages.service.js';
import type { MessageDatabase } from './messages.types.js';

type Row = Record<string, unknown>;
type Filter = Row | ((proxy: never) => boolean);

function matchesFilter(row: Row, filter: Filter): boolean {
  if (typeof filter === 'function') {
    const proxy = new Proxy(
      {},
      {
        get: (_target, key: string) => ({
          gt: (value: unknown) => (row[key] as number) > (value as number),
        }),
      },
    );
    return filter(proxy as never);
  }
  return Object.entries(filter).every(([key, value]) => row[key] === value);
}

function createTable(
  rows: Row[],
  idField: string | null,
  nextId: { value: number },
) {
  const makeQuery = (filters: Filter[]) => ({
    where: (filter: Filter) => makeQuery([...filters, filter]),
    first: async () =>
      rows.find((row) =>
        filters.every((filter) => matchesFilter(row, filter)),
      ) ?? null,
    all: async () =>
      rows.filter((row) =>
        filters.every((filter) => matchesFilter(row, filter)),
      ),
    updateAndCount: async (data: Row) => {
      const matched = rows.filter((row) =>
        filters.every((filter) => matchesFilter(row, filter)),
      );
      matched.forEach((row) => Object.assign(row, data));
      return matched.length;
    },
  });

  return {
    where: (filter: Filter) => makeQuery([filter]),
    create: async (data: Row) => {
      const row: Row = {
        readAt: null,
        createdAt: new Date().toISOString(),
        ...data,
      };
      if (idField && row[idField] === undefined) {
        row[idField] = nextId.value++;
      }
      rows.push(row);
      return { ...row };
    },
    rows,
  };
}

const RENTER_ID = 7;
const MATE_USER_ID = 5;
const OTHER_RENTER_ID = 8;

function createFixture() {
  const bookingRows: Row[] = [
    { id: 1, renterId: RENTER_ID, mateId: 3, status: 'pending' },
    { id: 2, renterId: RENTER_ID, mateId: 3, status: 'confirmed' },
    { id: 3, renterId: RENTER_ID, mateId: 3, status: 'completed' },
    { id: 4, renterId: RENTER_ID, mateId: 3, status: 'cancelled' },
  ];
  const mateRows: Row[] = [{ id: 3, userId: MATE_USER_ID }];
  const messageRows: Row[] = [];
  const notificationRows: Row[] = [];

  const bookingTable = createTable(bookingRows, 'id', { value: 100 });
  const mateTable = createTable(mateRows, 'id', { value: 100 });
  const messageTable = createTable(messageRows, 'id', { value: 1 });
  const notificationTable = createTable(notificationRows, 'id', { value: 1 });

  const database: MessageDatabase = {
    orm: {
      public: {
        Booking: bookingTable as never,
        Mate: mateTable as never,
        Message: messageTable as never,
        Notification: notificationTable as never,
      },
    },
    transaction: async (callback) => callback(database),
  };

  const notificationsService = new NotificationsService(
    database as unknown as NotificationDatabase,
  );
  const service = new MessagesService(database, notificationsService);

  return { service, bookingRows, messageRows, notificationRows };
}

describe('MessagesService', () => {
  let fixture: ReturnType<typeof createFixture>;

  beforeEach(() => {
    fixture = createFixture();
  });

  describe('assertParticipant', () => {
    it('returns the booking, mate, and recipientId for the renter participant', async () => {
      const result = await fixture.service.assertParticipant(
        { id: RENTER_ID },
        2,
      );
      expect(result.booking.id).toBe(2);
      expect(result.recipientId).toBe(MATE_USER_ID);
    });

    it('returns the renterId as recipientId when the caller is the mate owner', async () => {
      const result = await fixture.service.assertParticipant(
        { id: MATE_USER_ID },
        2,
      );
      expect(result.recipientId).toBe(RENTER_ID);
    });

    it('throws NotFoundException for a missing booking', async () => {
      await expect(
        fixture.service.assertParticipant({ id: RENTER_ID }, 999),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException (not Forbidden) for a non-participant caller', async () => {
      await expect(
        fixture.service.assertParticipant({ id: OTHER_RENTER_ID }, 2),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('returns paginated messages for a booking, oldest first', async () => {
      fixture.messageRows.push(
        {
          id: 1,
          bookingId: 2,
          senderId: RENTER_ID,
          content: 'second',
          readAt: null,
          createdAt: '2026-01-02T00:00:00.000Z',
        },
        {
          id: 2,
          bookingId: 2,
          senderId: MATE_USER_ID,
          content: 'first',
          readAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      );

      const result = await fixture.service.list({ id: RENTER_ID }, 2, {});
      expect(result.items.map((m) => m.content)).toEqual(['first', 'second']);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });
    });

    it('allows reading messages while the booking is still pending', async () => {
      await expect(
        fixture.service.list({ id: RENTER_ID }, 1, {}),
      ).resolves.toMatchObject({
        items: [],
      });
    });

    it('throws NotFoundException for a non-participant', async () => {
      await expect(
        fixture.service.list({ id: OTHER_RENTER_ID }, 2, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('persists a message and notifies the other participant when the booking is confirmed', async () => {
      const result = await fixture.service.create({ id: RENTER_ID }, 2, {
        content: 'Hello',
      });

      expect(result).toMatchObject({
        bookingId: 2,
        senderId: RENTER_ID,
        content: 'Hello',
        readAt: null,
      });
      expect(fixture.messageRows).toHaveLength(1);

      expect(fixture.notificationRows).toHaveLength(1);
      expect(fixture.notificationRows[0]).toMatchObject({
        userId: MATE_USER_ID,
        type: 'message_received',
        bookingId: 2,
      });
    });

    it('notifies the renter when the mate owner sends the message', async () => {
      await fixture.service.create({ id: MATE_USER_ID }, 2, {
        content: 'Hi there',
      });

      expect(fixture.notificationRows[0]).toMatchObject({
        userId: RENTER_ID,
        type: 'message_received',
      });
    });

    it('allows sending once the booking is completed', async () => {
      await expect(
        fixture.service.create({ id: RENTER_ID }, 3, { content: 'Thanks!' }),
      ).resolves.toMatchObject({
        bookingId: 3,
      });
    });

    it('rejects sending while the booking is still pending', async () => {
      await expect(
        fixture.service.create({ id: RENTER_ID }, 1, { content: 'Hello' }),
      ).rejects.toMatchObject({
        message: 'MESSAGE_NOT_ALLOWED',
      });
      await expect(
        fixture.service.create({ id: RENTER_ID }, 1, { content: 'Hello' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(fixture.messageRows).toHaveLength(0);
    });

    it('rejects sending after the booking is cancelled', async () => {
      await expect(
        fixture.service.create({ id: RENTER_ID }, 4, { content: 'Hello' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rejects a non-participant from sending', async () => {
      await expect(
        fixture.service.create({ id: OTHER_RENTER_ID }, 2, {
          content: 'Hello',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(fixture.messageRows).toHaveLength(0);
    });
  });

  describe('markRead', () => {
    beforeEach(() => {
      fixture.messageRows.push(
        {
          id: 1,
          bookingId: 2,
          senderId: RENTER_ID,
          content: 'from renter',
          readAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 2,
          bookingId: 2,
          senderId: MATE_USER_ID,
          content: 'from mate 1',
          readAt: null,
          createdAt: '2026-01-02T00:00:00.000Z',
        },
        {
          id: 3,
          bookingId: 2,
          senderId: MATE_USER_ID,
          content: 'from mate 2',
          readAt: null,
          createdAt: '2026-01-03T00:00:00.000Z',
        },
      );
    });

    it("marks only the other participant's unread messages as read, not the caller's own", async () => {
      const result = await fixture.service.markRead({ id: RENTER_ID }, 2);

      expect(result).toEqual({ updatedCount: 2 });
      expect(
        fixture.messageRows.find((m) => m['id'] === 1)?.['readAt'],
      ).toBeNull();
      expect(
        fixture.messageRows.find((m) => m['id'] === 2)?.['readAt'],
      ).not.toBeNull();
      expect(
        fixture.messageRows.find((m) => m['id'] === 3)?.['readAt'],
      ).not.toBeNull();
    });

    it('is a no-op (updatedCount: 0) when there is nothing unread from the other participant', async () => {
      await fixture.service.markRead({ id: RENTER_ID }, 2);
      const result = await fixture.service.markRead({ id: RENTER_ID }, 2);
      expect(result).toEqual({ updatedCount: 0 });
    });

    it('throws NotFoundException for a non-participant', async () => {
      await expect(
        fixture.service.markRead({ id: OTHER_RENTER_ID }, 2),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
