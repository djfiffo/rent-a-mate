import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<
      string[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);

    const request = context
      .switchToHttp()
      .getRequest<{ user?: { id?: number; role?: string } }>();
    const user = request.user;

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const userRole = user?.role;
    if (!userRole || !requiredRoles.includes(userRole)) {
      throw new ForbiddenException('Insufficient role permissions');
    }

    return true;
  }
}
