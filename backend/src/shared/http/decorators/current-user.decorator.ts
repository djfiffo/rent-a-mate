import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../../types/auth-user.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser | undefined => {
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    return request.user;
  },
);
