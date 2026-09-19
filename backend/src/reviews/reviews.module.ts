import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { db } from '../prisma/db.js';
import { BookingReviewController, ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';
import { REVIEWS_DATABASE_TOKEN } from './reviews.tokens.js';

@Module({
  imports: [AuthModule],
  controllers: [BookingReviewController, ReviewsController],
  providers: [ReviewsService, { provide: REVIEWS_DATABASE_TOKEN, useValue: db }],
})
export class ReviewsModule {}
