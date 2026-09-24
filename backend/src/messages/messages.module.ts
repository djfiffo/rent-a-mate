import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { db } from '../prisma/db.js';
import { MessagesController } from './messages.controller.js';
import { MessagesService } from './messages.service.js';
import { MESSAGES_DATABASE_TOKEN } from './messages.tokens.js';

/**
 * Exports `MessagesService` so a future Socket.IO `ChatGateway` (spec 6.7,
 * `/chat` namespace) can import this module and inject the same service
 * instance instead of re-implementing message persistence/authorization.
 */
@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [MessagesController],
  providers: [
    MessagesService,
    { provide: MESSAGES_DATABASE_TOKEN, useValue: db },
  ],
  exports: [MessagesService],
})
export class MessagesModule {}
