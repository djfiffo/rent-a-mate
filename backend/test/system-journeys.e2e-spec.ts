import { Temporal } from '@js-temporal/polyfill';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/prisma/db.js';
import { createE2eApp } from './fixtures/e2e-app.js';
import {
  cleanupTestDatabase,
  getFutureDate,
  seedTestDatabase,
  type TestData,
} from './fixtures/test-setup.js';

const PASSWORD = 'password123';

describe('Complete journeys and concurrency invariants (e2e)', () => {
  let app: INestApplication<App>;
  let data: TestData;

  beforeAll(async () => {
    ({ app } = await createE2eApp());
  });

  beforeEach(async () => {
    data = await seedTestDatabase();
  });

  afterAll(async () => {
    await cleanupTestDatabase();
    await app.close();
  });

  it('JOURNEY-01 completes register, profile, discovery, booking, chat, completion, review, and logout', async () => {
    const renterEmail = 'journey-renter@example.com';
    const mateEmail = 'journey-mate@example.com';
    await register(app, {
      name: 'Journey Renter',
      email: renterEmail,
      role: 'renter',
    });
    await register(app, {
      name: 'Journey Mate',
      email: mateEmail,
      role: 'mate',
    });
    const renter = await login(app, renterEmail);
    const mate = await login(app, mateEmail);

    const profile = await request(app.getHttpServer())
      .post('/api/v1/mates')
      .set(bearer(mate.accessToken))
      .send({
        age: 24,
        bio: 'Journey profile',
        hourlyRate: 400,
        provinceId: data.province.id,
        districtId: data.district.id,
        activityIds: [data.activity1.id],
        interestIds: [data.interest1.id],
      })
      .expect(201);
    const mateId = profile.body.data.mate.id as number;
    const bookingDate = getFutureDate(2);
    const dayOfWeek = Temporal.PlainDate.from(bookingDate).dayOfWeek;
    await request(app.getHttpServer())
      .post('/api/v1/mates/me/availability')
      .set(bearer(mate.accessToken))
      .send({ dayOfWeek, startTime: '09:00', endTime: '18:00' })
      .expect(201);

    const search = await request(app.getHttpServer())
      .get('/api/v1/mates')
      .query({
        q: 'journey profile',
        activityId: data.activity1.id,
        availableDate: bookingDate,
      })
      .expect(200);
    expect(search.body.data.items).toContainEqual(
      expect.objectContaining({ id: mateId }),
    );

    const booking = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set(bearer(renter.accessToken))
      .send({
        mateId,
        activityId: data.activity1.id,
        date: bookingDate,
        startTime: '10:00',
        endTime: '11:30',
      })
      .expect(201);
    const bookingId = booking.body.data.id as number;
    await request(app.getHttpServer())
      .patch(`/api/v1/bookings/${bookingId}/accept`)
      .set(bearer(mate.accessToken))
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/bookings/${bookingId}/messages`)
      .set(bearer(renter.accessToken))
      .send({ content: 'See you soon' })
      .expect(201);

    const pastDate = Temporal.Now.zonedDateTimeISO('Asia/Bangkok')
      .toPlainDate()
      .subtract({ days: 1 });
    const past = (time: string) =>
      pastDate
        .toZonedDateTime({ timeZone: 'Asia/Bangkok', plainTime: time })
        .toInstant();
    await db.orm.public.Booking.where({ id: bookingId }).update({
      date: past('00:00'),
      startTime: past('10:00'),
      endTime: past('11:30'),
    });
    await request(app.getHttpServer())
      .patch(`/api/v1/bookings/${bookingId}/complete`)
      .set(bearer(mate.accessToken))
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/bookings/${bookingId}/review`)
      .set(bearer(renter.accessToken))
      .send({ rating: 5, comment: 'Great session' })
      .expect(201);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/mates/${mateId}`)
      .expect(200);
    expect(detail.body.data.mate).toMatchObject({
      avgRating: 5,
      reviewCount: 1,
    });
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: renter.refreshToken })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: renter.refreshToken })
      .expect(401);
  });

  it('BOOK-24 permits at most one concurrent booking for the same mate and slot', async () => {
    const renter1 = await login(app, data.renter1.email);
    const renter2 = await login(app, data.renter2.email);
    const body = {
      mateId: data.mate1.id,
      activityId: data.activity1.id,
      date: getFutureDate(2),
      startTime: '10:00',
      endTime: '11:00',
    };

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/bookings')
        .set(bearer(renter1.accessToken))
        .send(body),
      request(app.getHttpServer())
        .post('/api/v1/bookings')
        .set(bearer(renter2.accessToken))
        .send(body),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const bookings = await db.orm.public.Booking.where({
      mateId: data.mate1.id,
    }).all();
    expect(bookings).toHaveLength(1);
  });

  it('AUTH-23 permits only one concurrent rotation of the same refresh token', async () => {
    const session = await login(app, data.renter1.email);
    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: session.refreshToken }),
      request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: session.refreshToken }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 401,
    ]);
    const rows = await db.orm.public.RefreshToken.where({
      userId: data.renter1.id,
    }).all();
    expect(rows.filter((row) => row.revokedAt === null)).toHaveLength(1);
  });
});

async function register(
  app: INestApplication<App>,
  input: { name: string; email: string; role: 'renter' | 'mate' },
) {
  return request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ ...input, password: PASSWORD })
    .expect(201);
}

async function login(app: INestApplication<App>, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD })
    .expect(201);
  return response.body.data as { accessToken: string; refreshToken: string };
}

function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
