import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { db } from '../prisma/db.js';
import { MessagesController } from './messages.controller.js';
import { MessagesEvents } from './messages.events.js';
import { MessagesService } from './messages.service.js';
import { MESSAGES_DATABASE_TOKEN } from './messages.tokens.js';

/**
 * Exports the service and its committed-message event stream for the
 * Socket.IO gateway. Realtime consumers observe writes but never persist
 * messages themselves.
 */
@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [MessagesController],
  providers: [
    MessagesService,
    MessagesEvents,
    { provide: MESSAGES_DATABASE_TOKEN, useValue: db },
  ],
  exports: [MessagesEvents, MessagesService],
})
export class MessagesModule {}
