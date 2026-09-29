import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { StripeWebhookService } from './stripe-webhook.service.js';

/**
 * Receives Stripe webhook deliveries. Deliberately has no `JwtAuthGuard` —
 * Stripe is the caller, not one of our own users — and relies instead on
 * `stripe-signature` verification inside `StripeWebhookService`.
 *
 * Requires the request body to arrive as a raw `Buffer` (not JSON-parsed):
 * `main.ts` registers `express.raw()` for this exact path *before* the
 * global `express.json()` middleware, so Stripe's signature can be
 * verified against the exact bytes it signed.
 */
@Controller('webhooks/stripe')
export class StripeWebhookController {
  constructor(private readonly stripeWebhookService: StripeWebhookService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() request: Request,
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ received: true }> {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }
    if (!Buffer.isBuffer(request.body)) {
      throw new BadRequestException('Expected raw request body');
    }

    await this.stripeWebhookService.processEvent(request.body, signature);
    return { received: true };
  }
}
