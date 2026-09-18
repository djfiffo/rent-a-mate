import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { MateDetailService } from './mate-detail.service.js';

@Controller('mates')
export class MateDetailController {
  constructor(private readonly detailService: MateDetailService) {}

  @Get(':mateId')
  async findOne(@Param('mateId', ParseIntPipe) mateId: number) {
    return {
      status: 'success' as const,
      message: 'OK',
      data: { mate: await this.detailService.findOne(mateId) },
    };
  }
}
