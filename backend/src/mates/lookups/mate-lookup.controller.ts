import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { successResponse } from '../../shared/http/api-response.js';
import { MateLookupService } from './mate-lookup.service.js';

@Controller()
export class MateLookupController {
  constructor(private readonly lookupService: MateLookupService) {}

  @Get('activities')
  async activities() {
    return successResponse('OK', { items: await this.lookupService.activities() });
  }

  @Get('interests')
  async interests() {
    return successResponse('OK', { items: await this.lookupService.interests() });
  }

  @Get('provinces')
  async provinces() {
    return successResponse('OK', { items: await this.lookupService.provinces() });
  }

  @Get('provinces/:provinceId/districts')
  async districts(@Param('provinceId', ParseIntPipe) provinceId: number) {
    return successResponse('OK', { items: await this.lookupService.districts(provinceId) });
  }
}
