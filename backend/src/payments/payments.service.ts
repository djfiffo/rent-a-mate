import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Temporal } from '@js-temporal/polyfill';
import type { AuthUser } from '../shared/types/auth-user.js';
import type { PaginatedResult } from '../shared/types/pagination.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { StripeProvider } from './providers/stripe.provider.js';
import { PAYMENTS_DATABASE_TOKEN } from './payments.tokens.js';
import type {
  BookingRecordForPayment,
  CreatePaymentResult,
  PaymentDatabase,
  PaymentDetail,
  PaymentParticipants,
  PaymentRecord,
  PaymentRefundWriter,
} from './payments.types.js';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto.js';

/**
 * Owns all `payments` persistence and the REST HTTP surface
 * (`PaymentsController`/`BookingPaymentsController`) for it. Kept
 * HTTP-agnostic like `MessagesService`/`BookingsService`: every public
 * method takes a plain `AuthUser` plus primitive/DTO arguments.
 *
 * Never talks to the Stripe SDK directly — only through `StripeProvider` —
 * so this class stays testable without network access.
 */
@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PAYMENTS_DATABASE_TOKEN) private readonly database: PaymentDatabase,
    private readonly notificationsService: NotificationsService,
    private readonly stripeProvider: StripeProvider,
  ) {}

  /**
   * Verifies `user` is a participant (renter or mate) of `bookingId` and
   * returns the booking/mate rows. Not found (rather than forbidden) is
   * returned for both a missing booking and a non-participant caller, so a
   * client cannot use this endpoint to probe whether a booking id exists —
   * mirrors `MessagesService.assertParticipant`.
   */
  async assertParticipant(
    user: AuthUser,
    bookingId: number,
  ): Promise<PaymentParticipants> {
    const booking = await this.database.orm.public.Booking.where({
      id: bookingId,
    }).first();
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const mate = await this.database.orm.public.Mate.where({
      id: booking.mateId,
    }).first();
    if (!mate) {
      throw new NotFoundException('Mate not found');
    }

    const isRenter = booking.renterId === user.id;
    const isMateOwner = mate.userId === user.id;
    if (!isRenter && !isMateOwner) {
      throw new NotFoundException('Booking not found');
    }

    return { booking, mate };
  }

  /**
   * Creates (or resumes) a Stripe PaymentIntent for a confirmed booking.
   * Renter-owner only. Returns immediately with `status='pending'` and a
   * `clientSecret` — the booking is only ever marked `paid` once Stripe's
   * `payment_intent.succeeded` webhook is received (see
   * `StripeWebhookService`), never synchronously here.
   */
  async pay(user: AuthUser, bookingId: number): Promise<CreatePaymentResult> {
    const { booking } = await this.assertParticipant(user, bookingId);
    if (booking.renterId !== user.id) {
      throw new ForbiddenException(
        'Only the renter who owns this booking can pay for it',
      );
    }
    if (booking.status !== 'confirmed') {
      throw new UnprocessableEntityException('PAYMENT_NOT_ALLOWED');
    }

    const existing = await this.database.orm.public.Payment.where({
      bookingId,
    }).first();

    if (existing?.status === 'paid') {
      // Idempotent: repeated calls after a successful payment return the
      // existing paid record rather than charging again.
      return { bookingId, status: existing.status, clientSecret: null };
    }
    if (existing?.status === 'refunding' || existing?.status === 'refunded') {
      throw new ConflictException('PAYMENT_ALREADY_EXISTS');
    }

    const amountInSmallestUnit = this.toSmallestCurrencyUnit(
      booking.totalPrice,
    );

    if (existing?.status === 'pending' && existing.providerReference) {
      // A PaymentIntent was already created for this booking (e.g. the
      // renter navigated away before confirming the card). Retrieve the
      // same intent's client secret instead of creating a second one.
      const intent = await this.stripeProvider.client.paymentIntents.retrieve(
        existing.providerReference,
      );
      return {
        bookingId,
        status: existing.status,
        clientSecret: intent.client_secret,
      };
    }

    return this.database.transaction(async (tx) => {
      const intent = await this.stripeProvider.client.paymentIntents.create(
        {
          amount: amountInSmallestUnit,
          currency: 'thb',
          metadata: { bookingId: String(bookingId) },
        },
        { idempotencyKey: `booking-${bookingId}-payment` },
      );

      if (existing) {
        await tx.orm.public.Payment.where({ bookingId }).update({
          status: 'pending',
          providerReference: intent.id,
        });
      } else {
        await tx.orm.public.Payment.create({
          bookingId,
          amount: booking.totalPrice,
          status: 'pending',
          providerReference: intent.id,
        });
      }

      return {
        bookingId,
        status: 'pending' as const,
        clientSecret: intent.client_secret,
      };
    });
  }

  /**
   * Current payment state for a booking. Any participant may read it. When
   * no `Payment` row exists yet, returns a virtual `pending` projection —
   * there is nothing to charge until `pay()` is called.
   */
  async getStatus(user: AuthUser, bookingId: number): Promise<PaymentDetail> {
    const { booking } = await this.assertParticipant(user, bookingId);
    const payment = await this.database.orm.public.Payment.where({
      bookingId,
    }).first();
    return this.toDetail(booking, payment);
  }

  /**
   * Own paginated payment history — bookings the caller is either the
   * renter of, or (when a mate) the mate assigned to.
   */
  async listMine(
    user: AuthUser,
    query: ListPaymentsQueryDto,
  ): Promise<PaginatedResult<PaymentDetail>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const bookingFilter = await this.buildBookingFilter(user);
    if (!bookingFilter) {
      return { items: [], meta: { page, limit, total: 0, totalPages: 0 } };
    }

    const bookings =
      await this.database.orm.public.Booking.where(bookingFilter).all();
    if (bookings.length === 0) {
      return { items: [], meta: { page, limit, total: 0, totalPages: 0 } };
    }

    const bookingIds = bookings.map((booking) => booking.id);
    const payments = await this.database.orm.public.Payment.where((p) =>
      p.bookingId.in(bookingIds),
    ).all();
    const paymentMap = new Map(
      payments.map((payment) => [payment.bookingId, payment]),
    );

    const sortedBookings = [...bookings].sort(
      (a, b) =>
        this.toEpochMillis(b.createdAt) - this.toEpochMillis(a.createdAt),
    );

    const total = sortedBookings.length;
    const offset = (page - 1) * limit;
    const items = sortedBookings
      .slice(offset, offset + limit)
      .map((booking) =>
        this.toDetail(booking, paymentMap.get(booking.id) ?? null),
      );

    return {
      items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Admin-triggered refund for a booking that was already paid — for
   * disputes/moderation outside the normal cancel flow.
   */
  async refundAsAdmin(bookingId: number): Promise<PaymentDetail> {
    const booking = await this.database.orm.public.Booking.where({
      id: bookingId,
    }).first();
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const updated = await this.refund(bookingId);
    if (!updated) {
      throw new UnprocessableEntityException('REFUND_NOT_ALLOWED');
    }

    return this.toDetail(booking, updated);
  }

  /**
   * Refunds a booking's payment if (and only if) it is currently `paid`.
   * Returns `null` when there is nothing eligible to refund (no payment
   * row, or already pending/failed/refunding/refunded) — callers that
   * auto-refund as a side effect of another action (see
   * `BookingsService.cancel()`) can treat `null` as "nothing to do" rather
   * than an error, since most bookings are cancelled before ever being
   * paid.
   *
   * Accepts an optional `writer` (defaulting to this service's own
   * database) so a caller already inside its own transaction — such as
   * `BookingsService.cancel()` — can pass its `tx` handle straight through
   * and keep the refund write atomic with the cancellation.
   *
   * Marks the row `refunding`, not `refunded` — the final `refunded`
   * status/notification is only ever set by the `charge.refunded` webhook,
   * mirroring how `pay()` never sets `paid` synchronously either.
   */
  async refund(
    bookingId: number,
    writer: PaymentRefundWriter = this.database,
  ): Promise<PaymentRecord | null> {
    const payment = await writer.orm.public.Payment.where({
      bookingId,
    }).first();
    if (!payment || payment.status !== 'paid') {
      return null;
    }
    if (!payment.providerReference) {
      throw new UnprocessableEntityException('REFUND_NOT_ALLOWED');
    }

    await this.stripeProvider.client.refunds.create(
      { payment_intent: payment.providerReference },
      { idempotencyKey: `booking-${bookingId}-refund` },
    );

    const updated = await writer.orm.public.Payment.where({ bookingId }).update(
      { status: 'refunding' },
    );
    if (!updated) {
      throw new NotFoundException('Payment not found');
    }

    return updated;
  }

  /**
   * Stripe dedupe check — `StripeWebhookService` calls this before acting
   * on an event, and `recordWebhookEvent()` after, so a retried delivery
   * of the same `event.id` is a no-op rather than double-notifying.
   */
  async isWebhookEventProcessed(eventId: string): Promise<boolean> {
    const existing = await this.database.orm.public.StripeWebhookEvent.where({
      id: eventId,
    }).first();
    return existing !== null;
  }

  async recordWebhookEvent(eventId: string, type: string): Promise<void> {
    await this.database.orm.public.StripeWebhookEvent.create({
      id: eventId,
      type,
    });
  }

  /**
   * Finalizes a payment as `paid` from the `payment_intent.succeeded`
   * webhook. Idempotent: a payment that is already `paid` is left alone
   * and no duplicate notification is sent.
   */
  async markPaid(providerReference: string): Promise<void> {
    await this.database.transaction(async (tx) => {
      const payment = await tx.orm.public.Payment.where({
        providerReference,
      }).first();
      if (!payment || payment.status === 'paid') {
        return;
      }

      await tx.orm.public.Payment.where({ providerReference }).update({
        status: 'paid',
        paidAt: Temporal.Now.instant(),
      });

      const booking = await tx.orm.public.Booking.where({
        id: payment.bookingId,
      }).first();
      if (booking) {
        await this.notificationsService.create(
          {
            userId: booking.renterId,
            type: 'payment_paid',
            message: 'Your payment was successful.',
            bookingId: booking.id,
          },
          tx,
        );
      }
    });
  }

  /**
   * Finalizes a payment as `failed` from the
   * `payment_intent.payment_failed` webhook.
   */
  async markFailed(providerReference: string): Promise<void> {
    await this.database.transaction(async (tx) => {
      const payment = await tx.orm.public.Payment.where({
        providerReference,
      }).first();
      if (!payment || payment.status === 'failed') {
        return;
      }

      await tx.orm.public.Payment.where({ providerReference }).update({
        status: 'failed',
        failedAt: Temporal.Now.instant(),
      });

      const booking = await tx.orm.public.Booking.where({
        id: payment.bookingId,
      }).first();
      if (booking) {
        await this.notificationsService.create(
          {
            userId: booking.renterId,
            type: 'payment_failed',
            message: 'Your payment failed. Please try again.',
            bookingId: booking.id,
          },
          tx,
        );
      }
    });
  }

  /**
   * Finalizes a payment as `refunded` from the `charge.refunded` webhook —
   * the counterpart to `refund()` marking it `refunding` synchronously.
   */
  async markRefunded(providerReference: string): Promise<void> {
    await this.database.transaction(async (tx) => {
      const payment = await tx.orm.public.Payment.where({
        providerReference,
      }).first();
      if (!payment || payment.status === 'refunded') {
        return;
      }

      await tx.orm.public.Payment.where({ providerReference }).update({
        status: 'refunded',
        refundedAt: Temporal.Now.instant(),
      });

      const booking = await tx.orm.public.Booking.where({
        id: payment.bookingId,
      }).first();
      if (booking) {
        await this.notificationsService.create(
          {
            userId: booking.renterId,
            type: 'payment_refunded',
            message: 'Your payment has been refunded.',
            bookingId: booking.id,
          },
          tx,
        );
      }
    });
  }

  private async buildBookingFilter(
    user: AuthUser,
  ): Promise<Record<string, unknown> | null> {
    if (user.role === 'mate') {
      const mate = await this.database.orm.public.Mate.where({
        userId: user.id,
      }).first();
      return mate ? { mateId: mate.id } : null;
    }
    return { renterId: user.id };
  }

  private toDetail(
    booking: BookingRecordForPayment,
    payment: PaymentRecord | null,
  ): PaymentDetail {
    return {
      bookingId: booking.id,
      amount: booking.totalPrice,
      status: payment?.status ?? 'pending',
      providerReference: payment?.providerReference ?? null,
      paidAt: payment?.paidAt ?? null,
      failedAt: payment?.failedAt ?? null,
      refundedAt: payment?.refundedAt ?? null,
    };
  }

  /** Stripe amounts are integers in the smallest currency unit (satang for THB). */
  private toSmallestCurrencyUnit(
    amount: BookingRecordForPayment['totalPrice'],
  ): number {
    return Math.round(Number(amount) * 100);
  }

  private toEpochMillis(value: unknown): number {
    if (value && typeof value === 'object' && 'epochMilliseconds' in value) {
      return (value as { epochMilliseconds: number }).epochMilliseconds;
    }
    if (value instanceof Date) {
      return value.getTime();
    }
    return new Date(String(value)).getTime();
  }
}
