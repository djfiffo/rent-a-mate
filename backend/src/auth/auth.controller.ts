import {
  Body,
  Controller,
  Get,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { CurrentUser } from '../shared/http/decorators/current-user.decorator.js';
import type { AuthUser } from '../shared/types/auth-user.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser | undefined) {
    return this.authService.me(user?.id);
  }

  /**
   * Issues an ephemeral, single-use capability for a Socket.IO handshake.
   * The access token remains in the BFF's HttpOnly cookie and never enters
   * browser JavaScript; only this limited ticket is returned to the client.
   */
  @Post('socket-ticket')
  @UseGuards(JwtAuthGuard)
  async createSocketTicket(@CurrentUser() user: AuthUser | undefined) {
    if (!user?.id)
      throw new UnauthorizedException('Authentication is required');
    return this.authService.createSocketTicket(user);
  }
}
