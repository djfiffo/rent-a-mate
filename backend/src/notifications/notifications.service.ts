import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NOTIFICATIONS_DATABASE_TOKEN } from './notifications.tokens.js';
import type {
  CreateNotificationInput,
  NotificationDatabase,
  NotificationRecord,
  NotificationWriter,
} from './notifications.types.js';

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(NOTIFICATIONS_DATABASE_TOKEN) private readonly database: NotificationDatabase,
  ) {}

  /**
   * Creates a notification. Accepts an optional `writer` so callers (e.g.
   * BookingsService) can pass their own transaction handle and keep the
   * notification write atomic with the booking mutation that triggered it.
   */
  async create(
    input: CreateNotificationInput,
    writer: NotificationWriter = this.database,
  ): Promise<NotificationRecord> {
    return writer.orm.public.Notification.create({
      userId: input.userId,
      type: input.type,
      message: input.message,
      bookingId: input.bookingId ?? null,
    });
  }

  async findMine(userId: number, unreadOnly = false): Promise<NotificationRecord[]> {
    const query = this.database.orm.public.Notification.where({ userId });
    const notifications = await (unreadOnly ? query.where({ isRead: false }) : query).all();
    return [...notifications].sort(
      (a, b) => this.toEpochMillis(b.createdAt) - this.toEpochMillis(a.createdAt),
    );
  }

  async markRead(userId: number, notificationId: number): Promise<NotificationRecord> {
    const notification = await this.database.orm.public.Notification.where({ id: notificationId }).first();
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    if (notification.userId !== userId) {
      throw new ForbiddenException('You do not own this notification');
    }
    if (notification.isRead) {
      return notification;
    }

    const updated = await this.database.orm.public.Notification
      .where({ id: notificationId })
      .update({ isRead: true });

    if (!updated) {
      throw new NotFoundException('Notification not found');
    }
    return updated;
  }

  async markAllRead(userId: number): Promise<{ updated: number }> {
    const updated = await this.database.orm.public.Notification
      .where({ userId, isRead: false })
      .updateAndCount({ isRead: true });

    return { updated };
  }

  private toEpochMillis(value: NotificationRecord['createdAt']): number {
    if (value && typeof value === 'object' && 'epochMilliseconds' in value) {
      return (value as { epochMilliseconds: number }).epochMilliseconds;
    }
    if (value instanceof Date) {
      return value.getTime();
    }
    return new Date(String(value)).getTime();
  }
}
