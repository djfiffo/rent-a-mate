import {
  Body,
  Controller,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../users/decorators/current-user.decorator.js';
import type { AuthUser } from '../users/users.types.js';
import { AdminService } from './admin.service.js';
import type { AdminReport } from './admin.types.js';
import { CreateReportDto } from './dto/create-report.dto.js';

interface ApiResponse<T> {
  status: 'success';
  message: string;
  data: T;
}

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly adminService: AdminService) {}

  @Post()
  async createReport(
    @CurrentUser() user: AuthUser | undefined,
    @Body() dto: CreateReportDto,
  ): Promise<ApiResponse<{ report: AdminReport }>> {
    if (!user || !Number.isInteger(user.id) || user.id <= 0) {
      throw new UnauthorizedException('Authenticated user is required');
    }
    const report = await this.adminService.createReport(user.id, dto);
    return { status: 'success', message: 'Report created', data: { report } };
  }
}
