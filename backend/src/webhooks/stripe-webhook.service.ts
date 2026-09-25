import { BadRequestException, Injectable } from '@nestjs/common';
import type Stripe from 'stripe';
import { PaymentsService } from '../payments/payments.service.js';
import { StripeProvider } from '../payments/providers/stripe.provider.js';

/**
 * Verifies and dispatches Stripe webhook deliveries. Stripe guarantees
 * at-least-once delivery, so every `event.id` is checked against
 * `StripeWebhookEvent` (via `PaymentsService`) before acting on it, and
 * recorded afterwards — a retried delivery is a no-op.
 *
 * Never mutates `Payment` rows directly: only `PaymentsService` (which owns
 * that table) does, via `markPaid`/`markFailed`/`markRefunded`. This class
 * only knows how to verify a Stripe signature and route event types.
 */
@Injectable()
export class StripeWebhookService {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly stripeProvider: StripeProvider,
  ) {}

  async processEvent(rawBody: Buffer, signature: string): Promise<void> {
    const event = this.verify(rawBody, signature);

    const alreadyProcessed = await this.paymentsService.isWebhookEventProcessed(
      event.id,
    );
    if (alreadyProcessed) {
      return;
    }

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object as Stripe.PaymentIntent;
        await this.paymentsService.markPaid(intent.id);
        break;
      }
      case 'payment_intent.payment_failed': {
        const intent = event.data.object as Stripe.PaymentIntent;
        await this.paymentsService.markFailed(intent.id);
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId =
          typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : charge.payment_intent?.id;
        if (paymentIntentId) {
          await this.paymentsService.markRefunded(paymentIntentId);
        }
        break;
      }
      default:
        // Every other event type is intentionally ignored — Stripe sends
        // many more events than this app currently reacts to.
        break;
    }

    await this.paymentsService.recordWebhookEvent(event.id, event.type);
  }

  private verify(rawBody: Buffer, signature: string): Stripe.Event {
    try {
      return this.stripeProvider.client.webhooks.constructEvent(
        rawBody,
        signature,
        this.stripeProvider.webhookSecret,
      );
    } catch {
      throw new BadRequestException('Invalid Stripe webhook signature');
    }
  }
}
