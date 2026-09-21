import { ForbiddenException } from '@nestjs/common';
import type { AuthUser } from '../../shared/types/auth-user.js';

export const requireMateUserId = (user?: AuthUser): number => {
  if (!user || !Number.isInteger(user.id) || user.id <= 0) {
    throw new ForbiddenException('Authenticated mate identity is required');
  }
  if (user.role !== 'mate') {
    throw new ForbiddenException('Mate role is required');
  }
  return user.id;
};
