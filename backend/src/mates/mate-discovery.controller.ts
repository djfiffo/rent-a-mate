import { Controller, Get, Optional, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ListMatesQueryDto } from './dto/list-mates-query.dto.js';
import { normalizeMateDiscoveryQuery } from './mate-discovery.query.js';
import { MateDiscoveryService } from './mate-discovery.service.js';
import { MateAvailabilityService } from './mate-availability.service.js';

@Controller('mates')
export class MateDiscoveryController {
  constructor(
    private readonly discoveryService: MateDiscoveryService,
    @Optional() private readonly availabilityService?: MateAvailabilityService,
  ) {}

  @Get()
  async list(@Query() query: ListMatesQueryDto) {
    return {
      status: 'success' as const,
      message: 'OK',
      data: await this.discoveryService.list(normalizeMateDiscoveryQuery(query)),
    };
  }

  @Get(':mateId/availability')
  async availability(
    @Param('mateId', ParseIntPipe) mateId: number,
    @Query('date') date: string,
  ) {
    if (!this.availabilityService) {
      throw new Error('Mate availability service is not configured');
    }
    return {
      status: 'success' as const,
      message: 'OK',
      data: {
        date,
        openSlots: (await this.availabilityService.getPublicAvailability(mateId, date)).map((slot) => ({
          start: slot.startTime,
          end: slot.endTime,
        })),
      },
    };
  }
}
