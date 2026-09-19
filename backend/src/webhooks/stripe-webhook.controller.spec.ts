import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { StripeWebhookController } from './stripe-webhook.controller.js';

function createRequest(body: unknown): { body: unknown } {
  return { body };
}

describe('StripeWebhookController', () => {
  it('delegates a valid signed request to the service and acknowledges it', async () => {
    const service = { processEvent: vi.fn().mockResolvedValue(undefined) };
    const controller = new StripeWebhookController(service as never);
    const rawBody = Buffer.from('{}');

    await expect(
      controller.handle(createRequest(rawBody) as never, 'sig_test'),
    ).resolves.toEqual({ received: true });
    expect(service.processEvent).toHaveBeenCalledWith(rawBody, 'sig_test');
  });

  it('rejects a request missing the stripe-signature header', async () => {
    const service = { processEvent: vi.fn() };
    const controller = new StripeWebhookController(service as never);

    await expect(
      controller.handle(createRequest(Buffer.from('{}')) as never, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.processEvent).not.toHaveBeenCalled();
  });

  it('rejects a request whose body was not left as a raw Buffer', async () => {
    const service = { processEvent: vi.fn() };
    const controller = new StripeWebhookController(service as never);

    await expect(
      controller.handle(createRequest({ foo: 'bar' }) as never, 'sig_test'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.processEvent).not.toHaveBeenCalled();
  });
});
