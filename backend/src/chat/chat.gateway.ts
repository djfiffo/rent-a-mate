import {
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { Subscription } from 'rxjs';
import { MessagesEvents } from '../messages/messages.events.js';
import { MessagesService } from '../messages/messages.service.js';
import { JoinBookingDto } from './dto/join-booking.dto.js';
import { MarkReadDto } from './dto/mark-read.dto.js';
import { TypingDto } from './dto/typing.dto.js';
import {
  ackError,
  ackOk,
  bookingRoom,
  type ChatAck,
  type ChatSocketData,
  type LeaveBookingPayload,
  type MessagesReadBroadcast,
  type TypingBroadcast,
} from './chat.types.js';
import { WsJwtGuard } from './ws-jwt.guard.js';

const VALIDATION_PIPE = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

/**
 * Optional real-time transport for booking chat. Durable message writes use
 * REST only. This gateway observes committed writes and broadcasts them, and
 * handles transient room, typing, and read-receipt events.
 *
 * Auth happens once per connection in `handleConnection` via `WsJwtGuard`,
 * not per message; each handler still fetches `client.data.user` (set there)
 * rather than trusting the payload for identity.
 */
@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: process.env['CORS_ORIGIN']
      ? process.env['CORS_ORIGIN']
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean)
      : false,
  },
})
export class ChatGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(ChatGateway.name);
  private messageCreatedSubscription?: Subscription;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly messagesService: MessagesService,
    private readonly wsJwtGuard: WsJwtGuard,
    private readonly messagesEvents: MessagesEvents,
  ) {}

  onModuleInit(): void {
    this.messageCreatedSubscription = this.messagesEvents.created$.subscribe(
      (message) => {
        this.server
          .to(bookingRoom(message.bookingId))
          .emit('new_message', message);
      },
    );
  }

  onModuleDestroy(): void {
    this.messageCreatedSubscription?.unsubscribe();
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const user = await this.wsJwtGuard.authenticate(client);
      (client.data as ChatSocketData).user = user;
    } catch (error) {
      this.wsJwtGuard.reject(
        client,
        error instanceof Error ? error.message : 'Unauthorized',
      );
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Socket disconnected: ${client.id}`);
  }

  /** Authorizes and joins `booking:{bookingId}` using the same participant check REST uses. */
  @SubscribeMessage('join_booking')
  @UsePipes(VALIDATION_PIPE)
  async handleJoinBooking(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: JoinBookingDto,
  ): Promise<ChatAck> {
    try {
      const user = this.requireUser(client);
      await this.messagesService.assertParticipant(user, dto.bookingId);
      await client.join(bookingRoom(dto.bookingId));
      return ackOk();
    } catch (error) {
      return ackError(error);
    }
  }

  /** No authorization check needed: leaving a room a client isn't in is a no-op. */
  @SubscribeMessage('leave_booking')
  handleLeaveBooking(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: LeaveBookingPayload,
  ): ChatAck {
    client.leave(bookingRoom(payload.bookingId));
    return ackOk();
  }

  /** Transient (not persisted): broadcast to everyone else in the room, never back to the sender. */
  @SubscribeMessage('typing')
  @UsePipes(VALIDATION_PIPE)
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: TypingDto,
  ): Promise<ChatAck> {
    try {
      const user = this.requireUser(client);
      await this.messagesService.assertParticipant(user, dto.bookingId);
      const broadcast: TypingBroadcast = {
        bookingId: dto.bookingId,
        userId: user.id,
        isTyping: dto.isTyping,
      };
      client.to(bookingRoom(dto.bookingId)).emit('typing', broadcast);
      return ackOk();
    } catch (error) {
      return ackError(error);
    }
  }

  /** Delegates to `MessagesService.markRead()` — the only place `readAt` is ever set (spec 6.7). */
  @SubscribeMessage('mark_read')
  @UsePipes(VALIDATION_PIPE)
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: MarkReadDto,
  ): Promise<ChatAck<{ updatedCount: number }>> {
    try {
      const user = this.requireUser(client);
      const { updatedCount } = await this.messagesService.markRead(
        user,
        dto.bookingId,
      );
      const broadcast: MessagesReadBroadcast = {
        bookingId: dto.bookingId,
        readerId: user.id,
        updatedCount,
      };
      this.server
        .to(bookingRoom(dto.bookingId))
        .emit('messages_read', broadcast);
      return ackOk({ updatedCount });
    } catch (error) {
      return ackError(error);
    }
  }

  private requireUser(client: Socket): ChatSocketData['user'] {
    const user = (client.data as Partial<ChatSocketData>).user;
    if (!user) {
      throw new UnauthorizedException('Not authenticated');
    }
    return user;
  }
}
