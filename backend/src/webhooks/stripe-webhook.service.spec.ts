import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { StripeWebhookService } from './stripe-webhook.service.js';

function createFixture() {
  const paymentsService = {
    isWebhookEventProcessed: vi.fn().mockResolvedValue(false),
    markPaid: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    markRefunded: vi.fn().mockResolvedValue(undefined),
    recordWebhookEvent: vi.fn().mockResolvedValue(undefined),
  };
  const stripeProvider = {
    client: { webhooks: { constructEvent: vi.fn() } },
    webhookSecret: 'whsec_test',
  };

  const service = new StripeWebhookService(
    paymentsService as never,
    stripeProvider as never,
  );
  return { service, paymentsService, stripeProvider };
}

const rawBody = Buffer.from('{}');

describe('StripeWebhookService', () => {
  it('rejects a request whose signature fails verification', async () => {
    const { service, stripeProvider, paymentsService } = createFixture();
    stripeProvider.client.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('bad signature');
    });

    await expect(service.processEvent(rawBody, 'sig')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(paymentsService.isWebhookEventProcessed).not.toHaveBeenCalled();
  });

  it('short-circuits an already-processed event without dispatching it', async () => {
    const { service, stripeProvider, paymentsService } = createFixture();
    stripeProvider.client.webhooks.constructEvent.mockReturnValue({
      id: 'evt_1',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_123' } },
    });
    paymentsService.isWebhookEventProcessed.mockResolvedValue(true);

    await service.processEvent(rawBody, 'sig');

    expect(paymentsService.markPaid).not.toHaveBeenCalled();
    expect(paymentsService.recordWebhookEvent).not.toHaveBeenCalled();
  });

  it('dispatches payment_intent.succeeded to markPaid and records the event', async () => {
    const { service, stripeProvider, paymentsService } = createFixture();
    stripeProvider.client.webhooks.constructEvent.mockReturnValue({
      id: 'evt_1',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_123' } },
    });

    await service.processEvent(rawBody, 'sig');

    expect(paymentsService.markPaid).toHaveBeenCalledWith('pi_123');
    expect(paymentsService.recordWebhookEvent).toHaveBeenCalledWith(
      'evt_1',
      'payment_intent.succeeded',
    );
  });

  it('dispatches payment_intent.payment_failed to markFailed', async () => {
    const { service, stripeProvider, paymentsService } = createFixture();
    stripeProvider.client.webhooks.constructEvent.mockReturnValue({
      id: 'evt_2',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_456' } },
    });

    await service.processEvent(rawBody, 'sig');

    expect(paymentsService.markFailed).toHaveBeenCalledWith('pi_456');
  });

  it('dispatches charge.refunded to markRefunded using a string payment_intent', async () => {
    const { service, stripeProvider, paymentsService } = createFixture();
    stripeProvider.client.webhooks.constructEvent.mockReturnValue({
      id: 'evt_3',
      type: 'charge.refunded',
      data: { object: { payment_intent: 'pi_789' } },
    });

    await service.processEvent(rawBody, 'sig');

    expect(paymentsService.markRefunded).toHaveBeenCalledWith('pi_789');
  });

  it('dispatches charge.refunded to markRefunded using an expanded payment_intent object', async () => {
    const { service, stripeProvider, paymentsService } = createFixture();
    stripeProvider.client.webhooks.constructEvent.mockReturnValue({
      id: 'evt_4',
      type: 'charge.refunded',
      data: { object: { payment_intent: { id: 'pi_999' } } },
    });

    await service.processEvent(rawBody, 'sig');

    expect(paymentsService.markRefunded).toHaveBeenCalledWith('pi_999');
  });

  it('ignores event types it does not react to, but still records them', async () => {
    const { service, stripeProvider, paymentsService } = createFixture();
    stripeProvider.client.webhooks.constructEvent.mockReturnValue({
      id: 'evt_5',
      type: 'customer.created',
      data: { object: {} },
    });

    await service.processEvent(rawBody, 'sig');

    expect(paymentsService.markPaid).not.toHaveBeenCalled();
    expect(paymentsService.markFailed).not.toHaveBeenCalled();
    expect(paymentsService.markRefunded).not.toHaveBeenCalled();
    expect(paymentsService.recordWebhookEvent).toHaveBeenCalledWith(
      'evt_5',
      'customer.created',
    );
  });
});
