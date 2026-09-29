import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

type MateVisibilityDatabase = { orm: { public: any } };

export const isPublicMateOwner = (user: any | null | undefined): boolean =>
  user !== null &&
  user !== undefined &&
  user.isActive !== false &&
  user.isBanned !== true;

export async function requirePublicMate(
  database: MateVisibilityDatabase,
  mateId: number,
): Promise<{ mate: any; owner: any }> {
  const mate = await database.orm.public.Mate.where({ id: mateId }).first();
  if (!mate || mate.isActive === false) {
    throw new NotFoundException('Mate not found');
  }

  const owner = await database.orm.public.User.where({
    id: mate.userId,
  }).first();
  if (!isPublicMateOwner(owner)) {
    throw new NotFoundException('Mate not found');
  }

  return { mate, owner };
}

export async function requireBookableMate(
  database: MateVisibilityDatabase,
  mateId: number,
): Promise<{ mate: any; owner: any }> {
  const mate = await database.orm.public.Mate.where({ id: mateId }).first();
  if (!mate) throw new NotFoundException('Mate not found');
  if (mate.isActive === false) {
    throw new UnprocessableEntityException('Mate profile is not active');
  }

  const owner = await database.orm.public.User.where({
    id: mate.userId,
  }).first();
  if (!isPublicMateOwner(owner)) throw new NotFoundException('Mate not found');
  return { mate, owner };
}
