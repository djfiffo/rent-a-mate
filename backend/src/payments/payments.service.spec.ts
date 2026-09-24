import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { NotificationDatabase } from '../notifications/notifications.types.js';
import { PaymentsService } from './payments.service.js';
import type { PaymentDatabase } from './payments.types.js';

type Row = Record<string, unknown>;
type Filter = Row | ((proxy: never) => boolean);

function matchesFilter(row: Row, filter: Filter): boolean {
  if (typeof filter === 'function') {
    const proxy = new Proxy(
      {},
      {
        get: (_target, key: string) => ({
          eq: (value: unknown) => row[key] === value,
          in: (values: unknown[]) => values.includes(row[key]),
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
    update: async (data: Row) => {
      const target = rows.find((row) =>
        filters.every((filter) => matchesFilter(row, filter)),
      );
      if (!target) return null;
      Object.assign(target, data);
      return { ...target };
    },
  });

  return {
    where: (filter: Filter) => makeQuery([filter]),
    create: async (data: Row) => {
      const row: Row = { ...data };
      if (idField && row[idField] === undefined) {
        row[idField] = nextId.value++;
      }
      rows.push(row);
      return { ...row };
    },
    rows,
  };
}

function createFixture() {
  const bookingRows: Row[] = [
    {
      id: 1,
      renterId: 7,
      mateId: 3,
      status: 'confirmed',
      totalPrice: '400.00',
    },
    { id: 2, renterId: 7, mateId: 3, status: 'pending', totalPrice: '100.00' },
  ];
  const mateRows: Row[] = [{ id: 3, userId: 5 }];
  const paymentRows: Row[] = [];
  const notificationRows: Row[] = [];
  const webhookEventRows: Row[] = [];

  const bookingTable = createTable(bookingRows, 'id', { value: 100 });
  const mateTable = createTable(mateRows, 'id', { value: 100 });
  const paymentTable = createTable(paymentRows, 'id', { value: 1 });
  const notificationTable = createTable(notificationRows, 'id', { value: 1 });
  const webhookEventTable = createTable(webhookEventRows, null, { value: 0 });

  const database: PaymentDatabase = {
    orm: {
      public: {
        Payment: paymentTable as never,
        Booking: bookingTable as never,
        Mate: mateTable as never,
        StripeWebhookEvent: webhookEventTable as never,
        Notification: notificationTable as never,
      },
    },
    transaction: async (callback) => callback(database),
  };

  const notificationsService = new NotificationsService(
    database as unknown as NotificationDatabase,
  );

  const stripeProvider = {
    client: {
      paymentIntents: {
        create: vi
          .fn()
          .mockResolvedValue({ id: 'pi_123', client_secret: 'secret_123' }),
        retrieve: vi
          .fn()
          .mockResolvedValue({ id: 'pi_123', client_secret: 'secret_123' }),
      },
      refunds: {
        create: vi.fn().mockResolvedValue({ id: 're_123' }),
      },
    },
    webhookSecret: 'whsec_test',
  };

  const service = new PaymentsService(
    database,
    notificationsService,
    stripeProvider as never,
  );

  return {
    service,
    database,
    bookingRows,
    paymentRows,
    notificationRows,
    webhookEventRows,
    stripeProvider,
  };
}

describe('PaymentsService', () => {
  let fixture: ReturnType<typeof createFixture>;
  const renter = { id: 7, role: 'renter' as const };
  const mateUser = { id: 5, role: 'mate' as const };
  const stranger = { id: 99, role: 'renter' as const };

  beforeEach(() => {
    fixture = createFixture();
  });

  describe('pay', () => {
    it('creates a Stripe PaymentIntent for a confirmed, unpaid booking', async () => {
      const result = await fixture.service.pay(renter, 1);

      expect(result).toEqual({
        bookingId: 1,
        status: 'pending',
        clientSecret: 'secret_123',
      });
      expect(
        fixture.stripeProvider.client.paymentIntents.create,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 40000, currency: 'thb' }),
        { idempotencyKey: 'booking-1-payment' },
      );
      expect(fixture.paymentRows).toEqual([
        expect.objectContaining({
          bookingId: 1,
          status: 'pending',
          providerReference: 'pi_123',
        }),
      ]);
    });

    it('rejects a non-renter caller', async () => {
      await expect(fixture.service.pay(mateUser, 1)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(
        fixture.stripeProvider.client.paymentIntents.create,
      ).not.toHaveBeenCalled();
    });

    it('rejects paying for a booking that is not confirmed', async () => {
      await expect(fixture.service.pay(renter, 2)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('is idempotent once the booking is already paid', async () => {
      fixture.paymentRows.push({
        bookingId: 1,
        status: 'paid',
        providerReference: 'pi_123',
      });

      const result = await fixture.service.pay(renter, 1);

      expect(result).toEqual({
        bookingId: 1,
        status: 'paid',
        clientSecret: null,
      });
      expect(
        fixture.stripeProvider.client.paymentIntents.create,
      ).not.toHaveBeenCalled();
    });

    it('rejects paying again once a refund is in progress or done', async () => {
      fixture.paymentRows.push({
        bookingId: 1,
        status: 'refunding',
        providerReference: 'pi_123',
      });

      await expect(fixture.service.pay(renter, 1)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('resumes an existing pending PaymentIntent instead of creating a new one', async () => {
      fixture.paymentRows.push({
        bookingId: 1,
        status: 'pending',
        providerReference: 'pi_123',
      });

      const result = await fixture.service.pay(renter, 1);

      expect(result).toEqual({
        bookingId: 1,
        status: 'pending',
        clientSecret: 'secret_123',
      });
      expect(
        fixture.stripeProvider.client.paymentIntents.retrieve,
      ).toHaveBeenCalledWith('pi_123');
      expect(
        fixture.stripeProvider.client.paymentIntents.create,
      ).not.toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('returns a virtual pending projection when no Payment row exists', async () => {
      const result = await fixture.service.getStatus(renter, 1);
      expect(result).toEqual(
        expect.objectContaining({
          bookingId: 1,
          status: 'pending',
          providerReference: null,
        }),
      );
    });

    it('is hidden from a non-participant', async () => {
      await expect(
        fixture.service.getStatus(stranger, 1),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('refund', () => {
    it('returns null when nothing has been paid yet', async () => {
      const result = await fixture.service.refund(1);
      expect(result).toBeNull();
      expect(
        fixture.stripeProvider.client.refunds.create,
      ).not.toHaveBeenCalled();
    });

    it('creates a Stripe refund and marks the payment refunding when paid', async () => {
      fixture.paymentRows.push({
        bookingId: 1,
        status: 'paid',
        providerReference: 'pi_123',
      });

      const result = await fixture.service.refund(1);

      expect(result).toEqual(
        expect.objectContaining({ bookingId: 1, status: 'refunding' }),
      );
      expect(fixture.stripeProvider.client.refunds.create).toHaveBeenCalledWith(
        { payment_intent: 'pi_123' },
        { idempotencyKey: 'booking-1-refund' },
      );
    });

    it('is a no-op for a payment that is already refunding or refunded', async () => {
      fixture.paymentRows.push({
        bookingId: 1,
        status: 'refunded',
        providerReference: 'pi_123',
      });

      const result = await fixture.service.refund(1);

      expect(result).toBeNull();
      expect(
        fixture.stripeProvider.client.refunds.create,
      ).not.toHaveBeenCalled();
    });
  });

  describe('webhook finalization', () => {
    it('markPaid transitions pending -> paid and notifies the renter', async () => {
      fixture.paymentRows.push({
        bookingId: 1,
        status: 'pending',
        providerReference: 'pi_123',
      });

      await fixture.service.markPaid('pi_123');

      expect(fixture.paymentRows[0]).toEqual(
        expect.objectContaining({ status: 'paid' }),
      );
      expect(fixture.notificationRows).toEqual([
        expect.objectContaining({
          userId: 7,
          type: 'payment_paid',
          bookingId: 1,
        }),
      ]);
    });

    it('markPaid is idempotent for an already-paid payment', async () => {
      fixture.paymentRows.push({
        bookingId: 1,
        status: 'paid',
        providerReference: 'pi_123',
      });

      await fixture.service.markPaid('pi_123');

      expect(fixture.notificationRows).toHaveLength(0);
    });

    it('markFailed transitions pending -> failed and notifies the renter', async () => {
      fixture.paymentRows.push({
        bookingId: 1,
        status: 'pending',
        providerReference: 'pi_123',
      });

      await fixture.service.markFailed('pi_123');

      expect(fixture.paymentRows[0]).toEqual(
        expect.objectContaining({ status: 'failed' }),
      );
      expect(fixture.notificationRows).toEqual([
        expect.objectContaining({
          userId: 7,
          type: 'payment_failed',
          bookingId: 1,
        }),
      ]);
    });

    it('markRefunded transitions refunding -> refunded and notifies the renter', async () => {
      fixture.paymentRows.push({
        bookingId: 1,
        status: 'refunding',
        providerReference: 'pi_123',
      });

      await fixture.service.markRefunded('pi_123');

      expect(fixture.paymentRows[0]).toEqual(
        expect.objectContaining({ status: 'refunded' }),
      );
      expect(fixture.notificationRows).toEqual([
        expect.objectContaining({
          userId: 7,
          type: 'payment_refunded',
          bookingId: 1,
        }),
      ]);
    });

    it('records and checks webhook event dedupe state', async () => {
      expect(await fixture.service.isWebhookEventProcessed('evt_1')).toBe(
        false,
      );

      await fixture.service.recordWebhookEvent(
        'evt_1',
        'payment_intent.succeeded',
      );

      expect(await fixture.service.isWebhookEventProcessed('evt_1')).toBe(true);
    });
  });
});
