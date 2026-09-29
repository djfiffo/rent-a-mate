import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Socket } from 'socket.io';
import { db } from '../prisma/db.js';
import { AuthService } from '../auth/auth.service.js';
import type { ChatSocketData } from './chat.types.js';

/**
 * Authenticates a socket in namespace middleware, mirroring
 * `JwtStrategy.validate()` (see auth/jwt.strategy.ts) rule-for-rule: the
 * same isBanned/isActive gate, after consuming a short-lived single-use
 * ticket. The browser receives that ticket from the same-origin BFF route;
 * it never reads or sends the access JWT over the socket.
 *
 * This is deliberately NOT a NestJS `CanActivate` guard bound with
 * `@UseGuards` per-message: authentication should happen exactly once, when
 * the socket first connects, not be re-checked on every event.
 */
@Injectable()
export class WsJwtGuard {
  constructor(private readonly authService: AuthService) {}

  /**
   * Verifies `client`'s handshake token and returns the authenticated user,
   * or throws `UnauthorizedException` if the token is missing/invalid/expired
   * or the account is banned/inactive.
   */
  async authenticate(client: Socket): Promise<ChatSocketData['user']> {
    const token = this.extractToken(client);
    if (!token) {
      throw new UnauthorizedException('Missing socket ticket');
    }

    const principal = await this.authService.consumeSocketTicket(token);
    const user = await db.orm.public.User.where({ id: principal.id }).first();
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (user.isBanned) {
      throw new UnauthorizedException('Account is banned');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    return {
      id: principal.id,
      role: user.role as ChatSocketData['user']['role'],
    };
  }

  private extractToken(client: Socket): string | undefined {
    const token = client.handshake.auth?.['ticket'];
    if (typeof token === 'string' && token.length > 0) {
      return token;
    }
    return undefined;
  }
}
