import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module.js';
import { StripeWebhookController } from './stripe-webhook.controller.js';
import { StripeWebhookService } from './stripe-webhook.service.js';

/**
 * Imports `PaymentsModule` to reuse its exported `PaymentsService`
 * (the only thing that writes `Payment` rows) and `StripeProvider`
 * (Stripe SDK client + webhook secret) rather than re-declaring either.
 */
@Module({
  imports: [PaymentsModule],
  controllers: [StripeWebhookController],
  providers: [StripeWebhookService],
})
export class WebhooksModule {}
