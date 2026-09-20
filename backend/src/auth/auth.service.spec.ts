import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Temporal } from '@js-temporal/polyfill';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dbMock, refreshTokens, users } = vi.hoisted(() => {
  type RefreshTokenRow = {
    userId: number;
    tokenHash: string;
    jti: string;
    expiresAt: any;
    revokedAt: any;
    replacedByJti?: string | null;
  };

  const refreshTokens = new Map<string, RefreshTokenRow>();
  const users = new Map<number, Record<string, unknown>>();

  const matchesRevokedAt = (
    filter: { revokedAt?: unknown },
    row: RefreshTokenRow,
  ) => !('revokedAt' in filter) || filter.revokedAt === row.revokedAt;

  const dbMock = {
    orm: {
      public: {
        RefreshToken: {
          where: (filter: { jti: string; revokedAt?: unknown }) => ({
            first: async () => {
              const row = refreshTokens.get(filter.jti);
              return row && matchesRevokedAt(filter, row) ? row : null;
            },
            update: async (update: Partial<RefreshTokenRow>) => {
              const row = refreshTokens.get(filter.jti);
              if (!row || !matchesRevokedAt(filter, row)) return null;

              if ('revokedAt' in update) row.revokedAt = update.revokedAt;
              if ('replacedByJti' in update) {
                row.replacedByJti = update.replacedByJti ?? null;
              }

              return row;
            },
          }),
          create: async (row: RefreshTokenRow) => {
            refreshTokens.set(row.jti, row);
            return row;
          },
        },
        User: {
          where: (filter: { id: number }) => ({
            first: async () => users.get(filter.id) ?? null,
          }),
        },
      },
    },
    transaction: async <T>(callback: (tx: typeof dbMock) => Promise<T>) =>
      callback(dbMock),
  };

  return { dbMock, refreshTokens, users };
});

vi.mock('../prisma/db.js', () => ({ db: dbMock }));

const { AuthService } = await import('./auth.service.js');

const ACCESS_SECRET = 'test-access-secret';
const REFRESH_SECRET = 'test-refresh-secret';

describe('AuthService', () => {
  let jwtService: JwtService;
  let service: InstanceType<typeof AuthService>;

  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = ACCESS_SECRET;
    process.env.JWT_REFRESH_SECRET = REFRESH_SECRET;

    refreshTokens.clear();
    users.clear();
    users.set(7, {
      id: 7,
      name: 'Nok',
      email: 'nok@example.com',
      role: 'renter',
      isBanned: false,
      isActive: true,
    });

    jwtService = new JwtService();
    service = new AuthService(jwtService, {} as never);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('logs out with a valid refresh token and revokes it by jti', async () => {
    const { refreshToken, row } = await createStoredRefreshToken(jwtService);

    await expect(service.logout(refreshToken)).resolves.toEqual({
      status: 'success',
      message: 'Logged out',
      data: null,
    });

    expect(row.revokedAt).not.toBeNull();
  });

  it('logs out without requiring an access token', async () => {
    const { refreshToken, row } = await createStoredRefreshToken(jwtService);

    await expect(service.logout(refreshToken)).resolves.toMatchObject({
      status: 'success',
      message: 'Logged out',
    });

    expect(row.revokedAt).not.toBeNull();
  });

  it('logs out when an access token is expired but the refresh token is valid', async () => {
    const expiredAccessToken = await jwtService.signAsync(
      { sub: 7, role: 'renter', jti: 'expired-access-jti', type: 'access' },
      { secret: ACCESS_SECRET, expiresIn: '-1s' },
    );
    const { refreshToken, row } = await createStoredRefreshToken(jwtService);

    expect(expiredAccessToken).toEqual(expect.any(String));
    await expect(service.logout(refreshToken)).resolves.toMatchObject({
      status: 'success',
      message: 'Logged out',
    });
    expect(row.revokedAt).not.toBeNull();
  });

  it('is idempotent when the refresh token is already revoked', async () => {
    const revokedAt = Temporal.Now.instant();
    const { refreshToken, row } = await createStoredRefreshToken(jwtService, {
      jti: 'already-revoked-jti',
      revokedAt,
    });

    await expect(service.logout(refreshToken)).resolves.toEqual({
      status: 'success',
      message: 'Logged out',
      data: null,
    });

    expect(row.revokedAt).toBe(revokedAt);
  });

  it('is idempotent when the refresh token is invalid', async () => {
    await expect(service.logout('not-a-valid-refresh-token')).resolves.toEqual({
      status: 'success',
      message: 'Logged out',
      data: null,
    });
    expect([...refreshTokens.values()]).toEqual([]);
  });

  it('rejects refresh after logout revokes the refresh token', async () => {
    const { refreshToken } = await createStoredRefreshToken(jwtService);

    await service.logout(refreshToken);

    await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

async function createStoredRefreshToken(
  jwtService: JwtService,
  options: {
    jti?: string;
    userId?: number;
    role?: string;
    revokedAt?: any;
  } = {},
) {
  const userId = options.userId ?? 7;
  const role = options.role ?? 'renter';
  const jti = options.jti ?? 'refresh-jti';
  const refreshToken = await jwtService.signAsync(
    { sub: userId, role, jti, type: 'refresh' },
    { secret: REFRESH_SECRET, expiresIn: '30d' },
  );
  const row = {
    userId,
    tokenHash: hashToken(refreshToken),
    jti,
    expiresAt: Temporal.Now.instant().add({ seconds: 30 * 24 * 60 * 60 }),
    revokedAt: options.revokedAt ?? null,
    replacedByJti: null,
  };

  refreshTokens.set(jti, row);
  return { refreshToken, row };
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
