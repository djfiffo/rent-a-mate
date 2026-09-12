import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../users/decorators/current-user.decorator.js';
import type { AuthUser } from '../users/users.types.js';
import { CreateMateProfileDto } from './dto/create-mate-profile.dto.js';
import { UpdateMateProfileDto  } from './dto/update-mate-profile.dto.js';
import { MatesService } from './mates.service.js';
import type { MateProfile } from './mates.types.js';

interface ApiResponse<T> {
  status: 'success';
  message: string;
  data: T;
}

@Controller('mates')
@UseGuards(JwtAuthGuard)
export class MatesController {
  constructor(private readonly matesService: MatesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthUser | undefined,
    @Body() input: CreateMateProfileDto,
  ): Promise<ApiResponse<{ mate: MateProfile }>> {
    const mate = await this.matesService.create(this.requireMateUserId(user), input);
    return this.success('Mate profile created', { mate });
  }

  @Get('me')
  async getProfile(@CurrentUser() user: AuthUser | undefined): Promise<ApiResponse<{ mate: MateProfile }>> {
    const mate = await this.matesService.getProfile(this.requireMateUserId(user));
    return this.success('Mate profile retrieved', { mate });
  }

  @Patch('me')
  async update(
    @CurrentUser() user: AuthUser | undefined,
    @Body() input: UpdateMateProfileDto,
  ): Promise<ApiResponse<{ mate: MateProfile }>> {
    const mate = await this.matesService.update(this.requireMateUserId(user), input);
    return this.success('Mate profile updated', { mate });
  }

  private requireMateUserId(user?: AuthUser): number {
    if (!user || !Number.isInteger(user.id) || user.id <= 0) {
      throw new ForbiddenException('Authenticated mate identity is required');
    }
    if (user.role !== 'mate') {
      throw new ForbiddenException('Mate role is required');
    }
    return user.id;
  }

  private success<T>(message: string, data: T): ApiResponse<T> {
    return { status: 'success', message, data };
  }
}
