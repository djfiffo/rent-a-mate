import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import { db } from '../prisma/db.js';
import type { ChatSocketData } from './chat.types.js';

type AccessTokenPayload = {
  sub: number;
  role: string;
  type: 'access' | 'refresh';
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

  constructor(private readonly jwtService: JwtService) {}

  /**
   * Verifies `client`'s handshake token and returns the authenticated user,
   * or throws `UnauthorizedException` if the token is missing/invalid/expired
   * or the account is banned/inactive.
   */
  async authenticate(client: Socket): Promise<ChatSocketData['user']> {
    const token = this.extractToken(client);
    if (!token) {
      throw new UnauthorizedException('Missing token');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid access token');
    }

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

  private extractToken(client: Socket): string | undefined {
    const fromAuth = client.handshake.auth?.['token'];
    if (typeof fromAuth === 'string' && fromAuth.length > 0) {
      return fromAuth;
    }
    // Fallback for clients that can't set handshake.auth (e.g. some older
    // Socket.IO client versions or plain WS testing tools).
    const fromQuery = client.handshake.query?.['token'];
    if (typeof fromQuery === 'string' && fromQuery.length > 0) {
      return fromQuery;
    }
    return undefined;
  }
}
