import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { db } from '../prisma/db.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { NOTIFICATIONS_DATABASE_TOKEN } from './notifications.tokens.js';

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    { provide: NOTIFICATIONS_DATABASE_TOKEN, useValue: db },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
