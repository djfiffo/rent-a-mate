import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { successResponse, type ApiResponse } from '../../shared/http/api-response.js';
import { CurrentUser } from '../../shared/http/decorators/current-user.decorator.js';
import type { AuthUser } from '../../shared/types/auth-user.js';
import { requireMateUserId } from '../internal/require-mate-user.js';
import type { MateAvailabilityRecord } from '../internal/mates.types.js';
import { CreateMateAvailabilityDto } from './dto/create-mate-availability.dto.js';
import { ReplaceMateAvailabilityDto } from './dto/replace-mate-availability.dto.js';
import { UpdateMateAvailabilityDto } from './dto/update-mate-availability.dto.js';
import { MateAvailabilityService } from './mate-availability.service.js';

@Controller('mates')
@UseGuards(JwtAuthGuard)
export class MateAvailabilityController {
  constructor(private readonly mateAvailabilityService: MateAvailabilityService) {}

  @Post('me/availability')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthUser | undefined,
    @Body() input: CreateMateAvailabilityDto,
  ): Promise<ApiResponse<{ availability: MateAvailabilityRecord }>> {
    const availability = await this.mateAvailabilityService.create(requireMateUserId(user), input);
    return successResponse('Mate availability created', { availability });
  }

  @Get('me/availability')
  async findMine(
    @CurrentUser() user: AuthUser | undefined,
  ): Promise<ApiResponse<{ availability: MateAvailabilityRecord[] }>> {
    const availability = await this.mateAvailabilityService.findMine(requireMateUserId(user));
    return successResponse('Mate availability retrieved', { availability });
  }

  @Put('me/availability')
  async replace(
    @CurrentUser() user: AuthUser | undefined,
    @Body() input: ReplaceMateAvailabilityDto,
  ): Promise<ApiResponse<{ slots: MateAvailabilityRecord[] }>> {
    const availability = await this.mateAvailabilityService.replace(requireMateUserId(user), input);
    return successResponse('Mate availability replaced', { slots: availability });
  }

  @Patch('me/availability/:availabilityId')
  async update(
    @CurrentUser() user: AuthUser | undefined,
    @Param('availabilityId', ParseIntPipe) availabilityId: number,
    @Body() input: UpdateMateAvailabilityDto,
  ): Promise<ApiResponse<{ availability: MateAvailabilityRecord }>> {
    const availability = await this.mateAvailabilityService.update(
      requireMateUserId(user),
      availabilityId,
      input,
    );
    return successResponse('Mate availability updated', { availability });
  }

  @Delete('me/availability/:availabilityId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthUser | undefined,
    @Param('availabilityId', ParseIntPipe) availabilityId: number,
  ): Promise<void> {
    await this.mateAvailabilityService.remove(requireMateUserId(user), availabilityId);
  }
}
