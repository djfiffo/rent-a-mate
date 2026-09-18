import type { db } from '../prisma/db.js';
import type { NotificationCreateInput, NotificationRecord } from '../notifications/notifications.types.js';

export type MessageClient = typeof db.orm.public.Message;
export type MessageFilter = Parameters<MessageClient['where']>[0];
export type MessageQuery = ReturnType<MessageClient['where']>;
export type MessageRecord = NonNullable<Awaited<ReturnType<MessageQuery['first']>>>;
export type MessageCreateInput = Parameters<MessageClient['create']>[0];

type BookingClient = typeof db.orm.public.Booking;
type BookingQuery = ReturnType<BookingClient['where']>;
export type BookingRecordForMessage = NonNullable<Awaited<ReturnType<BookingQuery['first']>>>;

type MateClient = typeof db.orm.public.Mate;
type MateQuery = ReturnType<MateClient['where']>;
export type MateRecordForMessage = NonNullable<Awaited<ReturnType<MateQuery['first']>>>;

/**
 * Structural shape shared by the top-level `db` client and the callback
 * argument of `db.transaction(...)`. Mirrors the pattern used by
 * `BookingTransaction` (see `bookings.types.ts`): declaring it structurally
 * (instead of importing the ORM runtime's exact transaction-context type)
 * keeps this module decoupled from exact ORM client typings and makes a
 * `tx` handle structurally satisfy `NotificationWriter` (it exposes
 * `Notification.create`), so it can be passed straight into
 * `NotificationsService.create(input, tx)` to keep the notification write
 * atomic with the message insert that triggered it.
 *
 * Kept intentionally narrow (only the members this module reads/writes)
 * so a future Socket.IO gateway can depend on this same type without
 * pulling in unrelated ORM surface — see `MessagesService` for how the
 * gateway is expected to reuse it.
 */
export type MessageTransaction = {
  orm: {
    public: {
      Message: {
        where: MessageClient['where'];
        create: MessageClient['create'];
      };
      Booking: {
        where: BookingClient['where'];
      };
      Mate: {
        where: MateClient['where'];
      };
      Notification: {
        create(data: NotificationCreateInput): Promise<NotificationRecord>;
      };
    };
  };
};

export type MessageDatabase = MessageTransaction & {
  transaction<T>(callback: (tx: MessageTransaction) => Promise<T>): Promise<T>;
};

export interface MessageParticipants {
  booking: BookingRecordForMessage;
  mate: MateRecordForMessage;
  /** The other participant's userId relative to the caller — used to address the `message_received` notification. */
  recipientId: number;
}

export interface CreateMessageResult {
  id: MessageRecord['id'];
  bookingId: MessageRecord['bookingId'];
  senderId: MessageRecord['senderId'];
  content: MessageRecord['content'];
  readAt: MessageRecord['readAt'];
  createdAt: MessageRecord['createdAt'];
}
