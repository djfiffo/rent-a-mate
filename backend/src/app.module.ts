import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AdminModule } from './admin/admin.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { MatesModule } from './mates/mates.module.js';
import { MessagesModule } from './messages/messages.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { ChatModule } from './chat/chat.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

const observeAppKey = process.env['OBSERVE_APP_KEY'];
const observeAppSecret = process.env['OBSERVE_APP_SECRET'];
const observeImports =
  observeAppKey && observeAppSecret
    ? [
        ObserveModule.forRoot({
          appKey: observeAppKey,
          appSecret: observeAppSecret,
          serviceId: 'backend',
        }),
      ]
    : [];

@Module({
  imports: [
    ...observeImports,
    AdminModule,
    BookingsModule,
    AuthModule,
    UsersModule,
    MatesModule,
    MessagesModule,
    NotificationsModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
