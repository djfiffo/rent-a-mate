import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class StripeProvider {
  private stripeClient?: Stripe;

  get localMockEnabled(): boolean {
    return (
      process.env['PAYMENTS_MODE'] === 'mock' &&
      process.env['NODE_ENV'] !== 'production'
    );
  }

  get client(): Stripe {
    const secretKey = process.env['STRIPE_SECRET_KEY'];

    if (!secretKey) {
      throw new ServiceUnavailableException('Payments are not configured');
    }

    if (!this.stripeClient) {
      this.stripeClient = new Stripe(secretKey, {
        apiVersion: (process.env['STRIPE_API_VERSION'] ??
          '2026-08-26.dahlia') as Stripe.LatestApiVersion,
      });
    }

    return this.stripeClient;
  }

  get webhookSecret(): string {
    const secret = process.env['STRIPE_WEBHOOK_SECRET'];

    if (!secret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
    }

    return secret;
  }
}
