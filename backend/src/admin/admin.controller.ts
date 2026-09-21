import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { successResponse, type ApiResponse } from '../shared/http/api-response.js';
import { CurrentUser } from '../users/decorators/current-user.decorator.js';
import type { AuthUser } from '../shared/types/auth-user.js';
import type { PaginatedResult } from '../shared/types/pagination.js';
import { AdminService } from './admin.service.js';
import type {
  AdminBookingItem,
  AdminReport,
  AdminSafeUser,
  AnalyticsResult,
} from './admin.types.js';
import { AnalyticsQueryDto } from './dto/analytics-query.dto.js';
import { BanUserDto } from './dto/ban-user.dto.js';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { ListReportsQueryDto } from './dto/list-reports-query.dto.js';
import { ResolveReportDto } from './dto/resolve-report.dto.js';
import { Roles } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  async listUsers(
    @Query() query: ListUsersQueryDto,
  ): Promise<ApiResponse<PaginatedResult<AdminSafeUser>>> {
    return successResponse('OK', await this.adminService.listUsers(query));
  }

  @Patch('users/:userId/ban')
  async banUser(
    @CurrentUser() admin: AuthUser | undefined,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: BanUserDto,
  ): Promise<ApiResponse<{ user: AdminSafeUser }>> {
    const adminId = this.requireAdminId(admin);
    const user = await this.adminService.banUser(adminId, userId, dto.reason);
    return successResponse('User banned', { user });
  }

  @Patch('users/:userId/unban')
  async unbanUser(
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<ApiResponse<{ user: AdminSafeUser }>> {
    const user = await this.adminService.unbanUser(userId);
    return successResponse('User unbanned', { user });
  }

  @Patch('users/:userId/activate')
  async activateUser(
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<ApiResponse<{ user: AdminSafeUser }>> {
    const user = await this.adminService.activateUser(userId);
    return successResponse('User activated', { user });
  }

  @Patch('users/:userId/verify')
  async verifyUser(
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<ApiResponse<{ user: AdminSafeUser }>> {
    const user = await this.adminService.verifyUser(userId);
    return successResponse('User verified', { user });
  }

  @Get('bookings')
  async listBookings(
    @Query() query: ListBookingsQueryDto,
  ): Promise<ApiResponse<PaginatedResult<AdminBookingItem>>> {
    return successResponse('OK', await this.adminService.listBookings(query));
  }

  @Get('analytics')
  async getAnalytics(
    @Query() query: AnalyticsQueryDto,
  ): Promise<ApiResponse<AnalyticsResult>> {
    return successResponse('OK', await this.adminService.getAnalytics(query));
  }

  @Get('reports')
  async listReports(
    @Query() query: ListReportsQueryDto,
  ): Promise<ApiResponse<PaginatedResult<AdminReport>>> {
    return successResponse('OK', await this.adminService.listReports(query));
  }

  @Patch('reports/:reportId')
  async resolveReport(
    @CurrentUser() admin: AuthUser | undefined,
    @Param('reportId', ParseIntPipe) reportId: number,
    @Body() dto: ResolveReportDto,
  ): Promise<ApiResponse<{ report: AdminReport }>> {
    const adminId = this.requireAdminId(admin);
    const report = await this.adminService.resolveReport(adminId, reportId, dto);
    return successResponse('Report resolved', { report });
  }

  private requireAdminId(user?: AuthUser): number {
    if (!user || !Number.isInteger(user.id) || user.id <= 0) {
      throw new UnauthorizedException('Authenticated admin is required');
    }
    return user.id;
  }
}
