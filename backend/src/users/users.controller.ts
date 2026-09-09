import {
  Body,
  Controller,
  Get,
  Patch,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthUser, SafeUser } from './users.types.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { ChangeEmailDto, ChangePasswordDto, UpdateProfileDto } from './dto/index.js';
import { UsersService } from './users.service.js';

interface ApiResponse<T> {
  status: 'success';
  message: string;
  data: T;
}

@Controller('users/me')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async getProfile(@CurrentUser() user?: AuthUser): Promise<ApiResponse<SafeUser>> {
    return this.success('Profile retrieved', await this.usersService.getProfile(this.requireUserId(user)));
  }

  @Patch()
  async updateProfile(
    @CurrentUser() user: AuthUser | undefined,
    @Body() dto: UpdateProfileDto,
  ): Promise<ApiResponse<SafeUser>> {
    return this.success('Profile updated', await this.usersService.updateProfile(this.requireUserId(user), dto));
  }

  @Patch('email')
  async changeEmail(
    @CurrentUser() user: AuthUser | undefined,
    @Body() dto: ChangeEmailDto,
  ): Promise<ApiResponse<SafeUser>> {
    return this.success('Email updated', await this.usersService.changeEmail(this.requireUserId(user), dto));
  }

  @Patch('password')
  async changePassword(
    @CurrentUser() user: AuthUser | undefined,
    @Body() dto: ChangePasswordDto,
  ): Promise<ApiResponse<SafeUser>> {
    return this.success('Password updated', await this.usersService.changePassword(this.requireUserId(user), dto));
  }

  private success(message: string, data: SafeUser): ApiResponse<SafeUser> {
    return { status: 'success', message, data };
  }

  private requireUserId(user?: AuthUser): number {
    if (!user || !Number.isInteger(user.id) || user.id <= 0) {
      throw new UnauthorizedException('Authenticated user is required');
    }
    return user.id;
  }
}
