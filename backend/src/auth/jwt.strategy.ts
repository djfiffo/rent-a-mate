import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { db } from '../prisma/db.js';

type AccessTokenPayload = {
  sub: number;
  role: string;
  type: 'access' | 'refresh';
};

function getAccessTokenSecret(): string {
  const secret = process.env['JWT_ACCESS_SECRET'];

  if (!secret?.trim()) {
    throw new Error('JWT_ACCESS_SECRET is not configured');
  }

  return secret;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getAccessTokenSecret(),
    });
  }

  async validate(payload: AccessTokenPayload) {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid access token');
    }

    const user = await db.orm.public.User.where({ id: payload.sub }).first();
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (user.isBanned) {
      throw new ForbiddenException('Account is banned');
    }
    if (!user.isActive) {
      throw new ForbiddenException('Account is inactive');
    }

    return {
      id: payload.sub,
      role: user.role,
    };
  }
}
