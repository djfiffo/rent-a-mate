import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { db } from '../prisma/db.js';
import { MateAvailabilityService } from './availability/mate-availability.service.js';
import { MatesController } from './profile/mate-profile.controller.js';
import { MatesService } from './profile/mate-profile.service.js';
import { MateDiscoveryController } from './discovery/mate-discovery.controller.js';
import { MateDiscoveryService } from './discovery/mate-discovery.service.js';
import { MateDetailController } from './detail/mate-detail.controller.js';
import { MateDetailService } from './detail/mate-detail.service.js';
import { MateLookupController } from './lookups/mate-lookup.controller.js';
import { MateLookupService } from './lookups/mate-lookup.service.js';
import { MateReviewController } from './reviews/mate-review.controller.js';
import { MateReviewService } from './reviews/mate-review.service.js';
import { MATES_DATABASE_TOKEN } from './internal/mates.tokens.js';

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
