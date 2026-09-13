import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException as ForbiddenExc,
  Get,
  Injectable,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

const ROLES_KEY = 'roles';
const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const role = context.switchToHttp().getRequest<{ user?: { role?: string } }>().user?.role;
    if (!role || !required.includes(role)) throw new ForbiddenExc('Insufficient role permissions');
    return true;
  }
}
import { CurrentUser } from '../users/decorators/current-user.decorator.js';
import type { AuthUser } from '../users/users.types.js';
import { AdminService } from './admin.service.js';
import type {
  AdminBookingItem,
  AdminSafeUser,
  AnalyticsResult,
  PaginatedResult,
} from './admin.types.js';
import { AnalyticsQueryDto } from './dto/analytics-query.dto.js';
import { BanUserDto } from './dto/ban-user.dto.js';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';

interface ApiResponse<T> {
  status: 'success';
  message: string;
  data: T;
}

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  async listUsers(
    @Query() query: ListUsersQueryDto,
  ): Promise<ApiResponse<PaginatedResult<AdminSafeUser>>> {
    return this.success('OK', await this.adminService.listUsers(query));
  }

  @Patch('users/:userId/ban')
  async banUser(
    @CurrentUser() admin: AuthUser | undefined,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: BanUserDto,
  ): Promise<ApiResponse<{ user: AdminSafeUser }>> {
    const adminId = this.requireAdminId(admin);
    const user = await this.adminService.banUser(adminId, userId, dto.reason);
    return this.success('User banned', { user });
  }

  @Patch('users/:userId/unban')
  async unbanUser(
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<ApiResponse<{ user: AdminSafeUser }>> {
    const user = await this.adminService.unbanUser(userId);
    return this.success('User unbanned', { user });
  }

  @Patch('users/:userId/activate')
  async activateUser(
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<ApiResponse<{ user: AdminSafeUser }>> {
    const user = await this.adminService.activateUser(userId);
    return this.success('User activated', { user });
  }

  @Patch('users/:userId/verify')
  async verifyUser(
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<ApiResponse<{ user: AdminSafeUser }>> {
    const user = await this.adminService.verifyUser(userId);
    return this.success('User verified', { user });
  }

  @Get('bookings')
  async listBookings(
    @Query() query: ListBookingsQueryDto,
  ): Promise<ApiResponse<PaginatedResult<AdminBookingItem>>> {
    return this.success('OK', await this.adminService.listBookings(query));
  }

  @Get('analytics')
  async getAnalytics(
    @Query() query: AnalyticsQueryDto,
  ): Promise<ApiResponse<AnalyticsResult>> {
    return this.success('OK', await this.adminService.getAnalytics(query));
  }

  private success<T>(message: string, data: T): ApiResponse<T> {
    return { status: 'success', message, data };
  }

  private requireAdminId(user?: AuthUser): number {
    if (!user || !Number.isInteger(user.id) || user.id <= 0) {
      throw new UnauthorizedException('Authenticated admin is required');
    }
    return user.id;
  }
}
