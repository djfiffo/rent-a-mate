import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';

/**
 * Thin wrapper around the Stripe Node SDK client. Kept as the single place
 * that touches `stripe` directly so `PaymentsService`/`StripeWebhookService`
 * only ever deal with plain request/response shapes and never import the
 * SDK themselves.
 */
@Injectable()
export class StripeProvider {
  readonly client: Stripe;

  constructor() {
    const secretKey = process.env['STRIPE_SECRET_KEY'];
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }

    this.client = new Stripe(secretKey, {
      apiVersion: (process.env['STRIPE_API_VERSION'] ?? '2026-08-26.dahlia') as Stripe.LatestApiVersion,
    });
  }

  get webhookSecret(): string {
    const secret = process.env['STRIPE_WEBHOOK_SECRET'];
    if (!secret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
    }
    return secret;
  }
}
