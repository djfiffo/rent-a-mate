import { createHash } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/prisma/db.js';
import { createE2eApp } from './fixtures/e2e-app.js';
import {
  cleanupTestDatabase,
  seedTestDatabase,
} from './fixtures/test-setup.js';

const PASSWORD = 'password123';

describe('Authentication and account settings (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    ({ app } = await createE2eApp());
  });

  beforeEach(async () => {
    await cleanupTestDatabase();
  });

  afterAll(async () => {
    await cleanupTestDatabase();
    await app.close();
  });

  it('AUTH-01/02/05/06 registers both roles, hashes passwords, normalizes email, and logs in', async () => {
    const renter = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'Renter One',
        email: 'Renter@Example.COM',
        password: PASSWORD,
        role: 'renter',
      })
      .expect(201);
    const mate = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'Mate One',
        email: 'mate@example.com',
        password: PASSWORD,
        role: 'mate',
      })
      .expect(201);

    expect(renter.body.data.user).toMatchObject({
      email: 'renter@example.com',
      role: 'renter',
    });
    expect(mate.body.data.user).toMatchObject({
      email: 'mate@example.com',
      role: 'mate',
    });
    expect(JSON.stringify(renter.body)).not.toContain('password');

    const stored = await db.orm.public.User.where({
      email: 'renter@example.com',
    }).first();
    expect(stored?.password).toMatch(/^scrypt\$/);
    expect(stored?.password).not.toContain(PASSWORD);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'RENTER@example.com', password: PASSWORD })
      .expect(201);
    expect(login.body.data).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      user: { id: renter.body.data.user.id, role: 'renter' },
    });

    const refreshRows = await db.orm.public.RefreshToken.where({
      userId: renter.body.data.user.id,
    }).all();
    expect(refreshRows).toHaveLength(1);
    expect(refreshRows[0].tokenHash).toBe(
      createHash('sha256').update(login.body.data.refreshToken).digest('hex'),
    );
    expect(refreshRows[0].tokenHash).not.toBe(login.body.data.refreshToken);
  });

  it('AUTH-02/03/04 rejects duplicates, invalid roles, weak input, and mass assignment', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'First User',
        email: 'same@example.com',
        password: PASSWORD,
        role: 'renter',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'Second User',
        email: 'SAME@example.com',
        password: PASSWORD,
        role: 'mate',
      })
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'Admin',
        email: 'admin@example.com',
        password: PASSWORD,
        role: 'admin',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'X', email: 'bad', password: 'short', role: 'renter' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'Injected',
        email: 'injected@example.com',
        password: PASSWORD,
        role: 'renter',
        isBanned: false,
      })
      .expect(400);

    expect(
      await db.orm.public.User.where({ email: 'same@example.com' }).all(),
    ).toHaveLength(1);
    expect(
      await db.orm.public.User.where({ email: 'admin@example.com' }).first(),
    ).toBeNull();
  });

  it('AUTH-07/08 rejects bad credentials and banned or inactive accounts', async () => {
    const data = await seedTestDatabase();

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: data.renter1.email, password: 'wrong-password' })
      .expect(401);

    await db.orm.public.User.where({ id: data.renter1.id }).update({
      isBanned: true,
    });
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: data.renter1.email, password: PASSWORD })
      .expect(403);

    await db.orm.public.User.where({ id: data.renter2.id }).update({
      isActive: false,
    });
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: data.renter2.email, password: PASSWORD })
      .expect(403);
  });

  it('AUTH-09/10 protects /auth/me and rechecks current account state', async () => {
    const data = await seedTestDatabase();
    const login = await loginAs(app, data.renter1.email);

    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.refreshToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.user).toMatchObject({
          id: data.renter1.id,
          email: data.renter1.email,
        });
        expect(JSON.stringify(body)).not.toContain('password');
      });

    await db.orm.public.User.where({ id: data.renter1.id }).update({
      isBanned: true,
    });
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .expect(403);
  });

  it('AUTH-11/12/13 rotates refresh tokens and revokes the replaced token by jti', async () => {
    const data = await seedTestDatabase();
    const first = await loginAs(app, data.renter1.email);

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(201);
    expect(refreshed.body.data.refreshToken).not.toBe(first.refreshToken);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: refreshed.body.data.refreshToken })
      .expect(201);

    const rows = await db.orm.public.RefreshToken.where({
      userId: data.renter1.id,
    }).all();
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.revokedAt === null)).toHaveLength(1);
    expect(
      rows.find((row) => row.tokenHash === hash(first.refreshToken))
        ?.replacedByJti,
    ).toEqual(expect.any(String));
  });

  it('AUTH-14/20 rejects invalid refresh payloads without creating sessions', async () => {
    const data = await seedTestDatabase();
    const login = await loginAs(app, data.renter1.email);

    for (const body of [
      {},
      { refreshToken: '' },
      { refreshToken: 42 },
      { refreshToken: 'not-a-jwt' },
    ]) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send(body)
        .expect(400);
    }
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.accessToken })
      .expect(401);
    expect(
      await db.orm.public.RefreshToken.where({ userId: data.renter1.id }).all(),
    ).toHaveLength(1);
  });

  it('AUTH-16/17/18/19/21 logs out by refresh token without requiring access and remains idempotent', async () => {
    const data = await seedTestDatabase();
    const sessionA = await loginAs(app, data.renter1.email);
    const sessionB = await loginAs(app, data.renter1.email);
    const expiredAccess = await new JwtService().signAsync(
      {
        sub: data.renter1.id,
        role: 'renter',
        jti: 'expired-e2e',
        type: 'access',
      },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '-1s' },
    );

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${expiredAccess}`)
      .send({ refreshToken: sessionA.refreshToken })
      .expect(201)
      .expect({ status: 'success', message: 'Logged out', data: null });
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: sessionA.refreshToken })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: sessionA.refreshToken })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: sessionB.refreshToken })
      .expect(201);

    const foreignInvalidToken = await new JwtService().signAsync(
      { sub: data.renter1.id, role: 'renter', jti: 'foreign', type: 'refresh' },
      { secret: 'wrong-refresh-secret', expiresIn: '1h' },
    );
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: foreignInvalidToken })
      .expect(201);
  });

  it('AUTH-22 keeps an unexpired access token usable after logout', async () => {
    const data = await seedTestDatabase();
    const login = await loginAs(app, data.renter1.email);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: login.refreshToken })
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .expect(200);
  });

  it('USER-01/02/03 reads and updates only safe profile fields', async () => {
    const data = await seedTestDatabase();
    const login = await loginAs(app, data.renter1.email);
    const auth = { Authorization: `Bearer ${login.accessToken}` };

    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set(auth)
      .expect(200)
      .expect(({ body }) =>
        expect(JSON.stringify(body)).not.toContain('password'),
      );
    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set(auth)
      .send({ name: '  Updated Name  ' })
      .expect(200)
      .expect(({ body }) => expect(body.data.name).toBe('Updated Name'));
    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set(auth)
      .send({ name: 'Valid', role: 'admin' })
      .expect(400);
    expect(
      (await db.orm.public.User.where({ id: data.renter1.id }).first())?.role,
    ).toBe('renter');
  });

  it('USER-04/05 changes a normalized email only after password verification', async () => {
    const data = await seedTestDatabase();
    const login = await loginAs(app, data.renter1.email);
    const auth = { Authorization: `Bearer ${login.accessToken}` };

    await request(app.getHttpServer())
      .patch('/api/v1/users/me/email')
      .set(auth)
      .send({ email: data.renter2.email, currentPassword: PASSWORD })
      .expect(409);
    await request(app.getHttpServer())
      .patch('/api/v1/users/me/email')
      .set(auth)
      .send({ email: 'new@example.com', currentPassword: 'wrong' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/v1/users/me/email')
      .set(auth)
      .send({ email: 'NEW@Example.COM', currentPassword: PASSWORD })
      .expect(200)
      .expect(({ body }) => expect(body.data.email).toBe('new@example.com'));
    await loginAs(app, 'new@example.com');
  });

  it('USER-06/07/08 changes password and revokes every active refresh session', async () => {
    const data = await seedTestDatabase();
    const sessionA = await loginAs(app, data.renter1.email);
    const sessionB = await loginAs(app, data.renter1.email);

    await request(app.getHttpServer())
      .patch('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${sessionA.accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'new-password-123' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: data.renter1.email, password: PASSWORD })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: data.renter1.email, password: 'new-password-123' })
      .expect(201);

    for (const refreshToken of [sessionA.refreshToken, sessionB.refreshToken]) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    }
  });
});

async function loginAs(app: INestApplication<App>, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD })
    .expect(201);
  return response.body.data as { accessToken: string; refreshToken: string };
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
