import type { AuthUser } from '../shared/types/auth-user.js';

/**
 * Socket.IO has no HTTP status codes, so every client->server event replies
 * through its ack callback with this envelope instead of throwing. Errors
 * from `MessagesService` (NotFoundException/UnprocessableEntityException,
 * etc.) are caught in `ChatGateway` and mapped to `{ ok: false, error }` via
 * `ackError()` rather than crashing the socket connection.
 */
export type ChatAck<T = undefined> =
  { ok: true; data?: T } | { ok: false; error: string };

export function ackOk<T>(data?: T): ChatAck<T> {
  return { ok: true, data };
}

export function ackError(error: unknown): ChatAck<never> {
  const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
  return { ok: false, error: message };
}

export function bookingRoom(bookingId: number): string {
  return `booking:${bookingId}`;
}

/** Data attached to `client.data` by `WsJwtGuard` during `handleConnection`. */
export interface ChatSocketData {
  user: AuthUser;
}

export interface JoinBookingPayload {
  bookingId: number;
}

export interface LeaveBookingPayload {
  bookingId: number;
}

export interface TypingPayload {
  bookingId: number;
  isTyping: boolean;
}

export interface MarkReadPayload {
  bookingId: number;
}

/** Broadcast to everyone else in the room on `typing`. */
export interface TypingBroadcast {
  bookingId: number;
  userId: number;
  isTyping: boolean;
}

/** Broadcast to `booking:{bookingId}` after a successful `mark_read`. */
export interface MessagesReadBroadcast {
  bookingId: number;
  readerId: number;
  updatedCount: number;
}
