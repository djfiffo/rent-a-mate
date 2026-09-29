import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MessagesModule } from '../messages/messages.module.js';
import { ChatGateway } from './chat.gateway.js';
import { WsJwtGuard } from './ws-jwt.guard.js';

/**
 * Optional real-time transport for the messaging feature (spec 6.7).
 * Imports `MessagesModule` to reuse its exported `MessagesService` instance
 * rather than depending on its internals directly, and `AuthModule` for
 * `AuthService` (needed by `WsJwtGuard` to consume handshake tickets).
 */
@Module({
  imports: [AuthModule, MessagesModule],
  providers: [ChatGateway, WsJwtGuard],
})
export class ChatModule {}
