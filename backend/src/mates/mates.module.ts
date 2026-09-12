import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { db } from '../prisma/db.js';
import { MateAvailabilityService } from './mate-availability.service.js';
import { MatesController } from './mates.controller.js';
import { MatesService } from './mates.service.js';
import { MATES_DATABASE_TOKEN } from './mates.tokens.js';

@Module({
  imports: [AuthModule],
  controllers: [MatesController],
  providers: [MatesService, MateAvailabilityService, { provide: MATES_DATABASE_TOKEN, useValue: db }],
  exports: [MateAvailabilityService],
})
export class MatesModule {}
