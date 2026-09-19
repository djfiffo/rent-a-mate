import type { db } from '../prisma/db.js';
import type { NotificationCreateInput, NotificationRecord } from '../notifications/notifications.types.js';
import type { PaymentClient } from '../payments/payments.types.js';

export type BookingClient = typeof db.orm.public.Booking;
export type BookingFilter = Parameters<BookingClient['where']>[0];
export type BookingQuery = ReturnType<BookingClient['where']>;
export type BookingRecord = NonNullable<Awaited<ReturnType<BookingQuery['first']>>>;
export type BookingCreateInput = Parameters<BookingClient['create']>[0];
export type BookingUpdateInput = Parameters<BookingQuery['update']>[0];
export type BookingStatus = BookingRecord['status'];

type MateClient = typeof db.orm.public.Mate;
type MateQuery = ReturnType<MateClient['where']>;
export type MateRecordForBooking = NonNullable<Awaited<ReturnType<MateQuery['first']>>>;

type ActivityClient = typeof db.orm.public.Activity;
type ActivityQuery = ReturnType<ActivityClient['where']>;
export type ActivityRecordForBooking = NonNullable<Awaited<ReturnType<ActivityQuery['first']>>>;

type UserClient = typeof db.orm.public.User;
type UserQuery = ReturnType<UserClient['where']>;
export type UserRecordForBooking = NonNullable<Awaited<ReturnType<UserQuery['first']>>>;

type MateActivityClient = typeof db.orm.public.MateActivity;
type MateActivityQuery = ReturnType<MateActivityClient['where']>;
export type MateActivityRecordForBooking = NonNullable<Awaited<ReturnType<MateActivityQuery['first']>>>;

/**
 * Structural shape shared by the top-level `db` client and the callback
 * argument of `db.transaction(...)`. Declaring it this way (instead of
 * importing the ORM runtime's transaction-context type) keeps this module
 * decoupled from exact ORM client typings and — importantly — makes a `tx`
 * handle structurally satisfy `NotificationWriter` (it has
 * `Notification.create`), so it can be passed straight into
 * `NotificationsService.create(input, tx)` to keep notification writes
 * atomic with the booking mutation that triggered them.
 */
export type BookingTransaction = {
  orm: {
    public: {
      Booking: {
        where: BookingClient['where'];
        create: BookingClient['create'];
      };
      Mate: {
        where: MateClient['where'];
      };
      Activity: {
        where: ActivityClient['where'];
      };
      User: {
        where: UserClient['where'];
      };
      MateActivity: {
        where: MateActivityClient['where'];
      };
      /**
       * Not otherwise used by `BookingsService` — added solely so this
       * transaction handle structurally satisfies `PaymentRefundWriter`,
       * letting `cancel()` pass its own `tx` into
       * `PaymentsService.refund(bookingId, tx)` and keep an auto-refund
       * atomic with the cancellation write, without importing any
       * payments-module type here.
       */
      Payment: {
        where: PaymentClient['where'];
      };
      Notification: {
        create(data: NotificationCreateInput): Promise<NotificationRecord>;
      };
    };
  };
};

export type BookingDatabase = BookingTransaction & {
  transaction<T>(callback: (tx: BookingTransaction) => Promise<T>): Promise<T>;
};

export interface BookingParticipantSummary {
  id: number;
  name: string;
}

export interface BookingDetail {
  id: BookingRecord['id'];
  status: BookingStatus;
  date: BookingRecord['date'];
  startTime: BookingRecord['startTime'];
  endTime: BookingRecord['endTime'];
  totalPrice: BookingRecord['totalPrice'];
  createdAt: BookingRecord['createdAt'];
  updatedAt: BookingRecord['updatedAt'];
  renter: BookingParticipantSummary;
  mate: BookingParticipantSummary;
  activity: BookingParticipantSummary;
}
