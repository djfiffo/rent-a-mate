import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthorizationModule } from '../shared/authorization/authorization.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { ReportsController } from './reports.controller.js';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [AdminController, ReportsController],
  providers: [AdminService],
})
export class AdminModule {}
