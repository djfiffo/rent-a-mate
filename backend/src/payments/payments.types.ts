import type { db } from '../prisma/db.js';
import type { NotificationCreateInput, NotificationRecord } from '../notifications/notifications.types.js';

export type PaymentClient = typeof db.orm.public.Payment;
export type PaymentFilter = Parameters<PaymentClient['where']>[0];
export type PaymentQuery = ReturnType<PaymentClient['where']>;
export type PaymentRecord = NonNullable<Awaited<ReturnType<PaymentQuery['first']>>>;
export type PaymentCreateInput = Parameters<PaymentClient['create']>[0];
export type PaymentStatusValue = PaymentRecord['status'];

type BookingClient = typeof db.orm.public.Booking;
type BookingQuery = ReturnType<BookingClient['where']>;
export type BookingRecordForPayment = NonNullable<Awaited<ReturnType<BookingQuery['first']>>>;

type MateClient = typeof db.orm.public.Mate;
type MateQuery = ReturnType<MateClient['where']>;
export type MateRecordForPayment = NonNullable<Awaited<ReturnType<MateQuery['first']>>>;

type StripeWebhookEventClient = typeof db.orm.public.StripeWebhookEvent;
/**
 * Deliberately not derived via `Parameters<StripeWebhookEventClient['create']>[0]`
 * — for this string-`@id` model that resolves to the ORM's last (broadest)
 * overload signature rather than the usable one, typing as `never`. Declared
 * explicitly instead; `processedAt` has a DB default so it is omitted here.
 */
export type StripeWebhookEventCreateInput = { id: string; type: string };

/**
 * Structural shape shared by the top-level `db` client and the callback
 * argument of `db.transaction(...)`. Mirrors the pattern used by
 * `MessageTransaction`/`BookingTransaction`: declared structurally so it
 * stays decoupled from the exact ORM client typings, and so a `tx` handle
 * structurally satisfies `NotificationWriter` (it exposes
 * `Notification.create`) and can be passed straight into
 * `NotificationsService.create(input, tx)`.
 */
export type PaymentTransaction = {
  orm: {
    public: {
      Payment: {
        where: PaymentClient['where'];
        create: PaymentClient['create'];
      };
      Booking: {
        where: BookingClient['where'];
      };
      Mate: {
        where: MateClient['where'];
      };
      StripeWebhookEvent: {
        where: StripeWebhookEventClient['where'];
        create(data: StripeWebhookEventCreateInput): Promise<unknown>;
      };
      Notification: {
        create(data: NotificationCreateInput): Promise<NotificationRecord>;
      };
    };
  };
};

export type PaymentDatabase = PaymentTransaction & {
  transaction<T>(callback: (tx: PaymentTransaction) => Promise<T>): Promise<T>;
};

/**
 * Minimal structural shape `PaymentsService.refund()` needs from a caller's
 * own transaction handle. `BookingsService.cancel()` (see bookings.types.ts
 * `BookingTransaction`) is extended to satisfy this shape so it can call
 * `refund()` from inside its own transaction when auto-refunding a booking
 * that was already paid, without this module depending on bookings.types.ts.
 */
export type PaymentRefundWriter = {
  orm: {
    public: {
      Payment: {
        where: PaymentClient['where'];
      };
      Notification: {
        create(data: NotificationCreateInput): Promise<NotificationRecord>;
      };
    };
  };
};

export interface PaymentParticipants {
  booking: BookingRecordForPayment;
  mate: MateRecordForPayment;
}

/**
 * Response shape for `GET /bookings/:bookingId/payment` and
 * `GET /payments`. When no `Payment` row exists yet for a confirmed
 * booking, callers get a virtual "pending" projection instead of a 404 —
 * there is simply nothing to charge until `POST /payment` is called.
 */
export interface PaymentDetail {
  bookingId: BookingRecordForPayment['id'];
  amount: BookingRecordForPayment['totalPrice'];
  status: PaymentStatusValue;
  providerReference: PaymentRecord['providerReference'] | null;
  paidAt: PaymentRecord['paidAt'] | null;
  failedAt: PaymentRecord['failedAt'] | null;
  refundedAt: PaymentRecord['refundedAt'] | null;
}

export interface CreatePaymentResult {
  bookingId: BookingRecordForPayment['id'];
  status: PaymentStatusValue;
  clientSecret: string | null;
}
