import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { db } from '../prisma/db.js';
import { AuthorizationModule } from '../shared/authorization/authorization.module.js';
import {
  BookingPaymentsController,
  PaymentsController,
} from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { PAYMENTS_DATABASE_TOKEN } from './payments.tokens.js';
import { StripeProvider } from './providers/stripe.provider.js';

/**
 * Exports `PaymentsService` so `BookingsModule` can inject it and trigger
 * an auto-refund from `BookingsService.cancel()` when a booking that was
 * already paid gets cancelled (see `PaymentsService.refund()`).
 */
@Module({
  imports: [AuthModule, AuthorizationModule, NotificationsModule],
  controllers: [BookingPaymentsController, PaymentsController],
  providers: [
    PaymentsService,
    StripeProvider,
    { provide: PAYMENTS_DATABASE_TOKEN, useValue: db },
  ],
  exports: [PaymentsService, StripeProvider],
})
export class PaymentsModule {}
