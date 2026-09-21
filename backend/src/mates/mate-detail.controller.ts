import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { successResponse } from '../shared/http/api-response.js';
import { MateDetailService } from './mate-detail.service.js';

@Controller('mates')
export class MateDetailController {
  constructor(private readonly detailService: MateDetailService) {}

  @Get(':mateId')
  async findOne(@Param('mateId', ParseIntPipe) mateId: number) {
    return successResponse('OK', { mate: await this.detailService.findOne(mateId) });
  }
}
