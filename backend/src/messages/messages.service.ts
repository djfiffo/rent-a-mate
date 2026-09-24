import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Temporal } from '@js-temporal/polyfill';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { AuthUser } from '../shared/types/auth-user.js';
import type { PaginatedResult } from '../shared/types/pagination.js';
import { MESSAGES_DATABASE_TOKEN } from './messages.tokens.js';
import type {
  CreateMessageResult,
  CreateMessageOutcome,
  MessageDatabase,
  MessageParticipants,
  MessageRecord,
} from './messages.types.js';
import { CreateMessageDto } from './dto/create-message.dto.js';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto.js';

/**
 * Owns all `messages` persistence and the REST HTTP surface
 * (`MessagesController`) for it. Deliberately kept HTTP-agnostic: every
 * public method takes a plain `AuthUser` plus primitive/DTO arguments and
 * returns plain data, never touching `Request`/`Response`. The Socket.IO
 * gateway reuses participant and read-state rules but does not write
 * messages; POST is the single message-create transport.
 */
@Injectable()
export class MessagesService {
  constructor(
    @Inject(MESSAGES_DATABASE_TOKEN) private readonly database: MessageDatabase,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Verifies `user` is a participant (renter or mate) of `bookingId` and
   * returns the booking/mate rows plus the other participant's userId.
   * Not found (rather than forbidden) is returned for both a missing
   * booking and a non-participant caller, so a client cannot use this
   * endpoint to probe whether a given booking id exists.
   *
   * Public so it can be reused as-is by the Socket.IO gateway to
   * authorize `join_booking`/`leave_booking`/`mark_read` events with the
   * exact same rule REST uses, per spec 6.7.
   */
  async assertParticipant(
    user: AuthUser,
    bookingId: number,
  ): Promise<MessageParticipants> {
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

    const recipientId = isRenter ? mate.userId : booking.renterId;
    return { booking, mate, recipientId };
  }

  /**
   * Paginated chat history for a booking, oldest first. Readable while the
   * booking is still `pending` (only sending is gated on confirmed/completed).
   */
  async list(
    user: AuthUser,
    bookingId: number,
    query: ListMessagesQueryDto,
  ): Promise<PaginatedResult<MessageRecord>> {
    await this.assertParticipant(user, bookingId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const all = await this.database.orm.public.Message.where({
      bookingId,
    }).all();
    const sorted = [...all].sort(
      (a, b) =>
        this.toEpochMillis(a.createdAt) - this.toEpochMillis(b.createdAt),
    );

    const total = sorted.length;
    const offset = (page - 1) * limit;
    const items = sorted.slice(offset, offset + limit);

    return {
      items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Persists a message and notifies the other participant, atomically.
   *
   * This is the single write path for `messages`. The REST controller calls
   * it once, then publishes the committed result for realtime broadcast.
   */
  async create(
    user: AuthUser,
    bookingId: number,
    dto: CreateMessageDto,
  ): Promise<CreateMessageOutcome> {
    const { booking, recipientId } = await this.assertParticipant(
      user,
      bookingId,
    );

    if (booking.status !== 'confirmed' && booking.status !== 'completed') {
      throw new UnprocessableEntityException('MESSAGE_NOT_ALLOWED');
    }

    const existing = await this.findByClientMessageId(
      user.id,
      dto.clientMessageId,
    );
    if (existing) {
      return { message: this.toResult(existing), created: false };
    }

    try {
      const message = await this.database.transaction(async (tx) => {
        const created = await tx.orm.public.Message.create({
          bookingId,
          senderId: user.id,
          clientMessageId: dto.clientMessageId,
          content: dto.content,
        });

        await this.notificationsService.create(
          {
            userId: recipientId,
            type: 'message_received',
            message: 'You have a new message',
            bookingId,
          },
          tx,
        );

        return this.toResult(created);
      });
      return { message, created: true };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const raced = await this.findByClientMessageId(
        user.id,
        dto.clientMessageId,
      );
      if (!raced) throw error;
      return { message: this.toResult(raced), created: false };
    }
  }

  /**
   * Marks every unread message sent *by the other participant* as read.
   * Never marks the caller's own messages (there is no concept of
   * "read by sender"). `readAt` otherwise stays `null` forever per spec
   * 6.7 — this is the only code path that ever sets it, and today it is
   * reachable via the Socket.IO `mark_read` event (no REST
   * mark-read endpoint exists for messages).
   */
  async markRead(
    user: AuthUser,
    bookingId: number,
  ): Promise<{ updatedCount: number }> {
    const { booking, mate } = await this.assertParticipant(user, bookingId);
    const otherParticipantId =
      booking.renterId === user.id ? mate.userId : booking.renterId;

    const updatedCount = await this.database.orm.public.Message.where({
      bookingId,
      senderId: otherParticipantId,
      readAt: null,
    }).updateAndCount({ readAt: Temporal.Now.instant() });

    return { updatedCount };
  }

  private toEpochMillis(value: MessageRecord['createdAt']): number {
    if (value && typeof value === 'object' && 'epochMilliseconds' in value) {
      return (value as { epochMilliseconds: number }).epochMilliseconds;
    }
    if (value instanceof Date) {
      return value.getTime();
    }
    return new Date(String(value)).getTime();
  }

  private findByClientMessageId(senderId: number, clientMessageId: string) {
    return this.database.orm.public.Message.where({
      senderId,
      clientMessageId,
    }).first();
  }

  private toResult(message: MessageRecord): CreateMessageResult {
    return {
      id: message.id,
      bookingId: message.bookingId,
      senderId: message.senderId,
      content: message.content,
      readAt: message.readAt,
      createdAt: message.createdAt,
    };
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}
