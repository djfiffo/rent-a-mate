import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { db } from '../prisma/db.js';
import { MateAvailabilityService } from './mate-availability.service.js';
import { MatesController } from './mates.controller.js';
import { MatesService } from './mates.service.js';
import { MateDiscoveryController } from './mate-discovery.controller.js';
import { MateDiscoveryService } from './mate-discovery.service.js';
import { MateDetailController } from './mate-detail.controller.js';
import { MateDetailService } from './mate-detail.service.js';
import { MateLookupController } from './mate-lookup.controller.js';
import { MateLookupService } from './mate-lookup.service.js';
import { MateReviewController } from './mate-review.controller.js';
import { MateReviewService } from './mate-review.service.js';
import { MATES_DATABASE_TOKEN } from './mates.tokens.js';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [MatesController, MateDiscoveryController, MateDetailController, MateReviewController, MateLookupController],
  providers: [
    MatesService,
    MateDiscoveryService,
    MateDetailService,
    MateReviewService,
    MateLookupService,
    MateAvailabilityService,
    { provide: MATES_DATABASE_TOKEN, useValue: db },
  ],
  exports: [MateAvailabilityService],
})
export class MatesModule {}
