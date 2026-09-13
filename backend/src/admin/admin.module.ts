import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { RolesGuard } from './roles.guard.js';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService, RolesGuard, Reflector],
  exports: [RolesGuard],
})
export class AdminModule {}
