import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
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
    return {
      status: 'success' as const,
      message: 'OK',
      data: await this.reviewService.list(mateId, query),
    };
  }
}
