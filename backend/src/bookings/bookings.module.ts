import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MatesModule } from '../mates/mates.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { db } from '../prisma/db.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';
import { BOOKINGS_DATABASE_TOKEN } from './bookings.tokens.js';

@Module({
  imports: [AuthModule, MatesModule, NotificationsModule],
  controllers: [BookingsController],
  providers: [BookingsService, { provide: BOOKINGS_DATABASE_TOKEN, useValue: db }],
})
export class BookingsModule {}
