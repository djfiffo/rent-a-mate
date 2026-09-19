import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy.js';
import { PasswordHashService } from '../users/password.service.js';

@Module({
  imports: [
    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
    JwtModule.register({
      secret:
        process.env['JWT_ACCESS_SECRET'],
      signOptions: { expiresIn: (process.env['JWT_ACCESS_TTL'] ?? '15m') as any },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, PasswordHashService],
  exports: [PassportModule, JwtModule],
})
export class AuthModule {}
