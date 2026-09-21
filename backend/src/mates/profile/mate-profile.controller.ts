import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { successResponse, type ApiResponse } from '../../shared/http/api-response.js';
import { CurrentUser } from '../../shared/http/decorators/current-user.decorator.js';
import type { AuthUser } from '../../shared/types/auth-user.js';
import { CreateMateProfileDto } from './dto/create-mate-profile.dto.js';
import { UpdateMateProfileDto  } from './dto/update-mate-profile.dto.js';
import { requireMateUserId } from '../internal/require-mate-user.js';
import type { MateProfile } from '../internal/mates.types.js';
import { MateProfileService } from './mate-profile.service.js';

@Controller('mates')
@UseGuards(JwtAuthGuard)
export class MateProfileController {
  constructor(private readonly mateProfileService: MateProfileService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthUser | undefined,
    @Body() input: CreateMateProfileDto,
  ): Promise<ApiResponse<{ mate: MateProfile }>> {
    const mate = await this.mateProfileService.create(requireMateUserId(user), input);
    return successResponse('Mate profile created', { mate });
  }

  @Get('me')
  async getProfile(@CurrentUser() user: AuthUser | undefined): Promise<ApiResponse<{ mate: MateProfile }>> {
    const mate = await this.mateProfileService.getProfile(requireMateUserId(user));
    return successResponse('Mate profile retrieved', { mate });
  }

  @Patch('me')
  async update(
    @CurrentUser() user: AuthUser | undefined,
    @Body() input: UpdateMateProfileDto,
  ): Promise<ApiResponse<{ mate: MateProfile }>> {
    const mate = await this.mateProfileService.update(requireMateUserId(user), input);
    return successResponse('Mate profile updated', { mate });
  }

  @Delete('me')
  async deactivate(
    @CurrentUser() user: AuthUser | undefined,
  ): Promise<ApiResponse<{ isActive: boolean; deactivatedAt: unknown }>> {
    const mate = await this.mateProfileService.deactivate(requireMateUserId(user));
    return successResponse('Mate profile deactivated', {
      isActive: mate.isActive,
      deactivatedAt: mate.deactivatedAt,
    });
  }

}
