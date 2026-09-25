import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import { db } from '../prisma/db.js';
import type { ChatSocketData } from './chat.types.js';

type AccessTokenPayload = {
  sub: number;
  role: string;
  type: 'socket_ticket';
  jti: string;
  exp: number;
};

/**
 * Authenticates a socket during `handleConnection`, mirroring
 * `JwtStrategy.validate()` (see auth/jwt.strategy.ts) rule-for-rule: the
 * same access-token type check and the same isBanned/isActive gate — just
 * reading the token from `handshake.auth.token` instead of an
 * `Authorization` header, since HTTP's `PassportStrategy`/`ExtractJwt`
 * machinery only understands HTTP requests, not the WebSocket handshake.
 *
 * This is deliberately NOT a NestJS `CanActivate` guard bound with
 * `@UseGuards` per-message: authentication should happen exactly once, when
 * the socket first connects, not be re-checked on every event.
 */
@Injectable()
export class WsJwtGuard {
  private readonly logger = new Logger(WsJwtGuard.name);
  private readonly consumedTickets = new Map<string, number>();

  constructor(private readonly jwtService: JwtService) {}

  /**
   * Verifies `client`'s handshake token and returns the authenticated user,
   * or throws `UnauthorizedException` if the token is missing/invalid/expired
   * or the account is banned/inactive.
   */
  async authenticate(client: Socket): Promise<ChatSocketData['user']> {
    const ticket = this.extractTicket(client);
    if (!ticket) {
      throw new UnauthorizedException('Missing socket ticket');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(ticket);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (payload.type !== 'socket_ticket' || !payload.jti || !payload.exp) {
      throw new UnauthorizedException('Invalid socket ticket');
    }
    const now = Math.floor(Date.now() / 1000);
    for (const [jti, expiresAt] of this.consumedTickets) {
      if (expiresAt <= now) this.consumedTickets.delete(jti);
    }
    if (this.consumedTickets.has(payload.jti)) {
      throw new UnauthorizedException('Socket ticket has already been used');
    }
    this.consumedTickets.set(payload.jti, payload.exp);

    const user = await db.orm.public.User.where({ id: payload.sub }).first();
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (user.isBanned) {
      throw new UnauthorizedException('Account is banned');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    return { id: payload.sub, role: user.role as ChatSocketData['user']['role'] };
  }

  /** Disconnects `client` after emitting an `error` event with `message`. */
  reject(client: Socket, message: string): void {
    this.logger.warn(`Rejecting socket ${client.id}: ${message}`);
    client.emit('error', { message });
    client.disconnect(true);
  }

  private extractTicket(client: Socket): string | undefined {
    const ticket = client.handshake.auth?.['ticket'];
    if (typeof ticket === 'string' && ticket.length > 0) {
      return ticket;
    }
    return undefined;
  }
}
