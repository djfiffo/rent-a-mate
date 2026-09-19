import type { db } from '../prisma/db.js';
import type { NotificationCreateInput, NotificationRecord } from '../notifications/notifications.types.js';

export type ReviewClient = typeof db.orm.public.Review;
export type ReviewFilter = Parameters<ReviewClient['where']>[0];
export type ReviewQuery = ReturnType<ReviewClient['where']>;
export type ReviewRecord = NonNullable<Awaited<ReturnType<ReviewQuery['first']>>>;
export type ReviewCreateInput = Parameters<ReviewClient['create']>[0];
export type ReviewUpdateInput = Parameters<ReviewQuery['update']>[0];

type BookingClient = typeof db.orm.public.Booking;
type BookingQuery = ReturnType<BookingClient['where']>;
export type BookingRecordForReview = NonNullable<Awaited<ReturnType<BookingQuery['first']>>>;

/**
 * Structural shape shared by the top-level `db` client and the callback
 * argument of `db.transaction(...)`. Declared this way (rather than
 * importing the ORM runtime's transaction-context type) so it stays
 * decoupled from exact ORM client typings and a `tx` handle structurally
 * satisfies `NotificationWriter` (`Notification.create`), matching the
 * pattern used by `BookingTransaction`/`PaymentTransaction`.
 */
export type ReviewTransaction = {
  orm: {
    public: {
      Review: {
        where: ReviewClient['where'];
        create: ReviewClient['create'];
      };
      Booking: {
        where: BookingClient['where'];
      };
      Notification: {
        create(data: NotificationCreateInput): Promise<NotificationRecord>;
      };
    };
  };
};

export type ReviewDatabase = ReviewTransaction & {
  transaction<T>(callback: (tx: ReviewTransaction) => Promise<T>): Promise<T>;
};

/**
 * Response shape for `POST /bookings/:bookingId/review`,
 * `PATCH /reviews/:reviewId`, and the `review` slice embedded in
 * `BookingDetail` (see bookings.types.ts).
 */
export interface ReviewDetail {
  id: ReviewRecord['id'];
  bookingId: ReviewRecord['bookingId'];
  renterId: ReviewRecord['renterId'];
  mateId: ReviewRecord['mateId'];
  rating: ReviewRecord['rating'];
  comment: ReviewRecord['comment'] | null;
  createdAt: ReviewRecord['createdAt'];
  updatedAt: ReviewRecord['updatedAt'];
}
