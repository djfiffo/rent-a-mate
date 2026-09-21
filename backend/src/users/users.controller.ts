import {
  Body,
  Controller,
  Get,
  Patch,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { successResponse, type ApiResponse } from '../shared/http/api-response.js';
import type { AuthUser } from '../shared/types/auth-user.js';
import type { SafeUser } from './users.types.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { ChangeEmailDto, ChangePasswordDto, UpdateProfileDto } from './dto/index.js';
import { UsersService } from './users.service.js';

@Controller('users/me')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async getProfile(@CurrentUser() user?: AuthUser): Promise<ApiResponse<SafeUser>> {
    return successResponse('Profile retrieved', await this.usersService.getProfile(this.requireUserId(user)));
  }

  @Patch()
  async updateProfile(
    @CurrentUser() user: AuthUser | undefined,
    @Body() dto: UpdateProfileDto,
  ): Promise<ApiResponse<SafeUser>> {
    return successResponse('Profile updated', await this.usersService.updateProfile(this.requireUserId(user), dto));
  }

  @Patch('email')
  async changeEmail(
    @CurrentUser() user: AuthUser | undefined,
    @Body() dto: ChangeEmailDto,
  ): Promise<ApiResponse<SafeUser>> {
    return successResponse('Email updated', await this.usersService.changeEmail(this.requireUserId(user), dto));
  }

  @Patch('password')
  async changePassword(
    @CurrentUser() user: AuthUser | undefined,
    @Body() dto: ChangePasswordDto,
  ): Promise<ApiResponse<SafeUser>> {
    return successResponse('Password updated', await this.usersService.changePassword(this.requireUserId(user), dto));
  }

  private requireUserId(user?: AuthUser): number {
    if (!user || !Number.isInteger(user.id) || user.id <= 0) {
      throw new UnauthorizedException('Authenticated user is required');
    }
    return user.id;
  }
}
