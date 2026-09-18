import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { MateLookupService } from './mate-lookup.service.js';

@Controller()
export class MateLookupController {
  constructor(private readonly lookupService: MateLookupService) {}

  @Get('activities')
  async activities() {
    return this.success(await this.lookupService.activities());
  }

  @Get('interests')
  async interests() {
    return this.success(await this.lookupService.interests());
  }

  @Get('provinces')
  async provinces() {
    return this.success(await this.lookupService.provinces());
  }

  @Get('provinces/:provinceId/districts')
  async districts(@Param('provinceId', ParseIntPipe) provinceId: number) {
    return this.success(await this.lookupService.districts(provinceId));
  }

  private success(items: Array<{ id: number; name: string }>) {
    return { status: 'success' as const, message: 'OK', data: { items } };
  }
}
