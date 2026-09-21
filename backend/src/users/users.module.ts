import { Module } from '@nestjs/common';
import { db } from '../prisma/db.js';
import { AuthModule } from '../auth/auth.module.js';
import { PasswordModule } from '../shared/security/password/password.module.js';
import { DATABASE_TOKEN } from './users.tokens.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [AuthModule, PasswordModule],

  controllers: [UsersController],
  providers: [
    UsersService,
    { provide: DATABASE_TOKEN, useValue: db },
  ],
  exports: [UsersService],
})
export class UsersModule {}
