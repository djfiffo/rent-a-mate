import type { db } from '../prisma/db.js';

export type NotificationClient = typeof db.orm.public.Notification;
export type NotificationFilter = Parameters<NotificationClient['where']>[0];
export type NotificationQuery = ReturnType<NotificationClient['where']>;
export type NotificationRecord = NonNullable<Awaited<ReturnType<NotificationQuery['first']>>>;
export type NotificationCreateInput = Parameters<NotificationClient['create']>[0];
export type NotificationUpdateInput = Parameters<NotificationQuery['update']>[0];

/**
 * Structural database dependency for the Notifications module itself
 * (list / mark-read / mark-all-read).
 */
export type NotificationDatabase = {
  orm: {
    public: {
      Notification: {
        where(filters: NotificationFilter): Pick<NotificationQuery, 'first' | 'all' | 'where' | 'update' | 'updateAndCount'>;
        create(data: NotificationCreateInput): Promise<NotificationRecord>;
      };
    };
  };
};

/**
 * Minimal structural shape a caller must satisfy to create a notification.
 * A transaction handle from another module (e.g. Bookings) can be passed
 * here directly as long as it exposes `orm.public.Notification.create`,
 * which keeps notification writes inside that module's own transaction
 * without introducing a hard dependency on this module's DI token.
 */
export type NotificationWriter = {
  orm: {
    public: {
      Notification: {
        create(data: NotificationCreateInput): Promise<NotificationRecord>;
      };
    };
  };
};

export interface CreateNotificationInput {
  userId: NotificationRecord['userId'];
  type: NotificationRecord['type'];
  message: string;
  bookingId?: NotificationRecord['bookingId'];
}
