import { Controller, Get, Query } from '@nestjs/common';
import { ListMatesQueryDto } from './dto/list-mates-query.dto.js';
import { normalizeMateDiscoveryQuery } from './mate-discovery.query.js';
import { MateDiscoveryService } from './mate-discovery.service.js';

@Controller('mates')
export class MateDiscoveryController {
  constructor(private readonly discoveryService: MateDiscoveryService) {}

  @Get()
  async list(@Query() query: ListMatesQueryDto) {
    return {
      status: 'success' as const,
      message: 'OK',
      data: await this.discoveryService.list(normalizeMateDiscoveryQuery(query)),
    };
  }
}
