import { BadRequestException, ConflictException } from '@nestjs/common';
import { Temporal } from '@js-temporal/polyfill';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeEmailDto, ChangePasswordDto, UpdateProfileDto } from './dto/index.js';
import { UsersService } from './users.service.js';
import type {
  UserDatabase,
  UserFilter,
  UserRecord,
  UserUpdate,
} from './users.types.js';
import type { PasswordService } from '../shared/security/password/password.types.js';

const user: UserRecord = {
  id: 7,
  name: 'Nok',
  email: 'user@example.com',
  password: 'stored-password',
  role: 'renter',
  createdAt: Temporal.Instant.from('2026-09-07T00:00:00.000Z'),
  updatedAt: Temporal.Instant.from('2026-09-07T00:00:00.000Z'),
};

function createFixture() {
  const update = vi.fn(async (data: UserUpdate): Promise<UserRecord> => ({ ...user, ...data }));
  const where = vi.fn((filters: UserFilter) => ({
    first: vi.fn(async () => {
      if (filters.id === user.id) return { ...user };
      return null;
    }),
    update,
  }));
  const revokeRefreshTokens = vi.fn().mockResolvedValue(1);
  const refreshTokenWhere = vi.fn(() => ({ all: vi.fn().mockResolvedValue([{ id: 'token-a' }, { id: 'token-b' }]), update: revokeRefreshTokens }));
  const database: UserDatabase = {
    orm: { public: { User: { where }, RefreshToken: { where: refreshTokenWhere } } },
  };
  const passwordService: PasswordService = {
    verify: vi.fn(async (plainText: string) => plainText === 'current-password'),
    hash: vi.fn(async () => 'new-password-hash'),
  };
  return { service: new UsersService(database, passwordService), where, update, passwordService, refreshTokenWhere, revokeRefreshTokens };
}

describe('UsersService', () => {
  let fixture: ReturnType<typeof createFixture>;

  beforeEach(() => {
    fixture = createFixture();
  });

  it('returns a safe profile without the internal password', async () => {
    const result = await fixture.service.getProfile(7);
    expect(result).toMatchObject({ id: 7, email: 'user@example.com', name: 'Nok' });
    expect(result).not.toHaveProperty('password');
  });

  it('updates the user name', async () => {
    await fixture.service.updateProfile(7, { name: 'Nok P.' } satisfies UpdateProfileDto);
    expect(fixture.update).toHaveBeenCalledWith({ name: 'Nok P.' });
  });

  it('rejects a duplicate normalized email', async () => {
    fixture.where.mockImplementation((filters: UserFilter) => ({
      first: vi.fn(async () => {
        if (filters.id === 7) return { ...user };
        if (filters.email === 'other@example.com') return { ...user, id: 8 };
        return null;
      }),
      update: fixture.update,
    }));
    await expect(fixture.service.changeEmail(7, {
      email: 'OTHER@EXAMPLE.COM',
      currentPassword: 'current-password',
    } satisfies ChangeEmailDto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('verifies the current password before changing the password', async () => {
    await fixture.service.changePassword(7, {
      currentPassword: 'current-password',
      newPassword: 'new-password-value',
    } satisfies ChangePasswordDto);
    expect(fixture.passwordService.hash).toHaveBeenCalledWith('new-password-value');
    expect(fixture.update).toHaveBeenCalledWith({ password: 'new-password-hash' });
  });

  it('rejects an invalid current password', async () => {
    await expect(fixture.service.changePassword(7, {
      currentPassword: 'wrong-password',
      newPassword: 'new-password-value',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('revokes active refresh sessions after changing the password', async () => {
    await fixture.service.changePassword(7, {
      currentPassword: 'current-password',
      newPassword: 'new-password-value',
    });

    expect(fixture.refreshTokenWhere).toHaveBeenCalledWith({ userId: 7, revokedAt: null });
    expect(fixture.refreshTokenWhere).toHaveBeenCalledWith({ id: 'token-a', revokedAt: null });
    expect(fixture.refreshTokenWhere).toHaveBeenCalledWith({ id: 'token-b', revokedAt: null });
    expect(fixture.revokeRefreshTokens).toHaveBeenCalledTimes(2);
    expect(fixture.revokeRefreshTokens).toHaveBeenCalledWith({ revokedAt: expect.anything() });
  });
});
