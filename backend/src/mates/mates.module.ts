import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { db } from '../prisma/db.js';
import { MateAvailabilityService } from './mate-availability.service.js';
import { MatesController } from './mates.controller.js';
import { MatesService } from './mates.service.js';
import { MateDiscoveryController } from './mate-discovery.controller.js';
import { MateDiscoveryService } from './mate-discovery.service.js';
import { MATES_DATABASE_TOKEN } from './mates.tokens.js';

@Module({
  imports: [AuthModule],
  controllers: [MatesController, MateDiscoveryController],
  providers: [MatesService, MateDiscoveryService, MateAvailabilityService, { provide: MATES_DATABASE_TOKEN, useValue: db }],
  exports: [MateAvailabilityService],
})
export class MatesModule {}
