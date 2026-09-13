import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { isUserBanned } from '../admin/ban.store.js';

type AccessTokenPayload = {
  sub: number;
  role: string;
  type: 'access' | 'refresh';
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        process.env['JWT_ACCESS_SECRET'] ??
        'development-access-secret-change-me',
    });
  }

  validate(payload: AccessTokenPayload) {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid access token');
    }

    if (isUserBanned(payload.sub)) {
      throw new ForbiddenException('Account is banned');
    }

    return {
      id: payload.sub,
      role: payload.role,
    };
  }
}