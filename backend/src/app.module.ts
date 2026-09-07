import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { AuthModule } from './auth/auth.module.js';

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
    BookingsModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
