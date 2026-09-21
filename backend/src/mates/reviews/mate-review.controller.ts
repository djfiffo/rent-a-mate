import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { successResponse } from '../../shared/http/api-response.js';
import { ListReviewsQueryDto } from './dto/list-reviews-query.dto.js';
import { MateReviewService } from './mate-review.service.js';

@Controller('mates')
export class MateReviewController {
  constructor(private readonly reviewService: MateReviewService) {}

  @Get(':mateId/reviews')
  async list(
    @Param('mateId', ParseIntPipe) mateId: number,
    @Query() query: ListReviewsQueryDto,
  ) {
    return successResponse('OK', await this.reviewService.list(mateId, query));
  }
}
