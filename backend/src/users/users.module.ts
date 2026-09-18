import { Module } from '@nestjs/common';
import { db } from '../prisma/db.js';
import { AuthModule } from '../auth/auth.module.js';
import { PasswordHashService } from './password.service.js';
import { DATABASE_TOKEN, PASSWORD_SERVICE } from './users.tokens.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [AuthModule],
  
  controllers: [UsersController],
  providers: [
    UsersService,
    PasswordHashService,
    { provide: DATABASE_TOKEN, useValue: db },
    { provide: PASSWORD_SERVICE, useExisting: PasswordHashService },
  ],
  exports: [UsersService],
})
export class UsersModule {}
