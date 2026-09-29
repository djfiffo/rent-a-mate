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

describe('Mate profiles, availability, gallery, and discovery (e2e)', () => {
  let app: INestApplication<App>;
  let data: TestData;
  let tokens: Record<string, string>;

  beforeAll(async () => {
    ({ app } = await createE2eApp());
  });

  beforeEach(async () => {
    data = await seedTestDatabase();
    tokens = {
      renter1: await accessToken(app, data.renter1.email),
      mate1: await accessToken(app, data.mateUser1.email),
      mate2: await accessToken(app, data.mateUser2.email),
      admin: await accessToken(app, data.admin.email),
    };
  });

  afterAll(async () => {
    await cleanupTestDatabase();
    await app.close();
  });

  it('LOOKUP-01/02 exposes sorted public reference data and validates province IDs', async () => {
    for (const path of ['activities', 'interests', 'provinces']) {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/${path}`)
        .expect(200);
      const names = response.body.data.items.map(
        (item: { name: string }) => item.name,
      );
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    }

    const districts = await request(app.getHttpServer())
      .get(`/api/v1/provinces/${data.province.id}/districts`)
      .expect(200);
    expect(districts.body.data.items).toContainEqual({
      id: data.district.id,
      name: data.district.name,
    });
    await request(app.getHttpServer())
      .get('/api/v1/provinces/999999/districts')
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/v1/provinces/not-an-id/districts')
      .expect(400);
  });

  it('MATE-01/02/03 creates one profile for a mate and enforces role and uniqueness', async () => {
    const email = 'new-mate@example.com';
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'New Mate', email, password: PASSWORD, role: 'mate' })
      .expect(201);
    const token = await accessToken(app, email);
    const auth = bearer(token);

    await request(app.getHttpServer())
      .get('/api/v1/mates/me')
      .set(auth)
      .expect(404);
    const created = await request(app.getHttpServer())
      .post('/api/v1/mates')
      .set(auth)
      .send({
        age: 25,
        bio: 'Friendly travel mate',
        hourlyRate: 350.5,
        provinceId: data.province.id,
        districtId: data.district.id,
        activityIds: [data.activity1.id],
        interestIds: [data.interest1.id],
      })
      .expect(201);
    expect(created.body.data.mate).toMatchObject({
      age: 25,
      bio: 'Friendly travel mate',
      isActive: true,
      province: { id: data.province.id },
      district: { id: data.district.id },
    });
    expect(created.body.data.mate.activities).toContainEqual({
      id: data.activity1.id,
      name: data.activity1.name,
    });
    expect(created.body.data.mate.interests).toContainEqual({
      id: data.interest1.id,
      name: data.interest1.name,
    });

    await request(app.getHttpServer())
      .post('/api/v1/mates')
      .set(auth)
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/mates')
      .set(auth)
      .send({
        age: 25,
        hourlyRate: 350,
        provinceId: data.province.id,
        districtId: data.district.id,
        activityIds: [],
        interestIds: [],
      })
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/v1/mates')
      .set(bearer(tokens.renter1))
      .send({
        age: 25,
        hourlyRate: 350,
        provinceId: data.province.id,
        districtId: data.district.id,
        activityIds: [],
        interestIds: [],
      })
      .expect(403);
  });

  it('MATE-04/05/06 validates age, rates, arrays, and lookup relationships atomically', async () => {
    const email = 'validation-mate@example.com';
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'Validation Mate',
        email,
        password: PASSWORD,
        role: 'mate',
      })
      .expect(201);
    const auth = bearer(await accessToken(app, email));
    const base = {
      bio: 'Profile',
      provinceId: data.province.id,
      districtId: data.district.id,
      activityIds: [data.activity1.id],
      interestIds: [data.interest1.id],
    };

    for (const invalid of [
      { ...base, age: 17, hourlyRate: 100 },
      { ...base, age: 121, hourlyRate: 100 },
      { ...base, age: 25, hourlyRate: 0 },
      { ...base, age: 25, hourlyRate: 1.123 },
      {
        ...base,
        age: 25,
        hourlyRate: 100,
        activityIds: [data.activity1.id, data.activity1.id],
      },
    ]) {
      await request(app.getHttpServer())
        .post('/api/v1/mates')
        .set(auth)
        .send(invalid)
        .expect(400);
    }

    await request(app.getHttpServer())
      .post('/api/v1/mates')
      .set(auth)
      .send({ ...base, age: 25, hourlyRate: 100, districtId: 999999 })
      .expect(422);
    const user = await db.orm.public.User.where({ email }).first();
    expect(
      await db.orm.public.Mate.where({ userId: user!.id }).first(),
    ).toBeNull();
  });

  it('MATE-07/08 updates scalar and relation fields and rejects empty updates', async () => {
    const auth = bearer(tokens.mate1);
    await request(app.getHttpServer())
      .patch('/api/v1/mates/me')
      .set(auth)
      .send({
        bio: ' Updated bio ',
        hourlyRate: 725.25,
        activityIds: [],
        interestIds: [],
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.mate.bio).toBe('Updated bio');
        expect(Number(body.data.mate.hourlyRate)).toBe(725.25);
        expect(body.data.mate.activities).toEqual([]);
        expect(body.data.mate.interests).toEqual([]);
      });
    await request(app.getHttpServer())
      .patch('/api/v1/mates/me')
      .set(auth)
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/v1/mates/me')
      .set(auth)
      .send({ districtId: 999999 })
      .expect(422);
  });

  it('MATE-09/10 soft-deactivates a profile and hides it from public discovery', async () => {
    const auth = bearer(tokens.mate1);
    await request(app.getHttpServer())
      .delete('/api/v1/mates/me')
      .set(auth)
      .expect(200)
      .expect(({ body }) => expect(body.data.isActive).toBe(false));
    await request(app.getHttpServer())
      .delete('/api/v1/mates/me')
      .set(auth)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/mates/me')
      .set(auth)
      .expect(200);
    await request(app.getHttpServer())
      .patch('/api/v1/mates/me')
      .set(auth)
      .send({ bio: 'No' })
      .expect(422);
    await request(app.getHttpServer())
      .get(`/api/v1/mates/${data.mate1.id}`)
      .expect(404);
    const search = await request(app.getHttpServer())
      .get('/api/v1/mates')
      .expect(200);
    expect(
      search.body.data.items.map((mate: { id: number }) => mate.id),
    ).not.toContain(data.mate1.id);
  });

  it('MATE-12/SEC-08 never exposes a password through own mate profile responses', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/mates/me')
      .set(bearer(tokens.mate1))
      .expect(200);
    expect(JSON.stringify(response.body)).not.toContain('password');
    expect(response.body.data.mate.user).toEqual({
      id: data.mateUser1.id,
      name: data.mateUser1.name,
    });
  });

  it('PHOTO-01/02/03/05 uploads supported image bytes, accepts URLs, and caps the gallery', async () => {
    const auth = bearer(tokens.mate1);
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]);
    const uploaded = await request(app.getHttpServer())
      .post('/api/v1/mates/me/photos')
      .set(auth)
      .attach('photo', png, {
        filename: 'avatar.png',
        contentType: 'image/png',
      })
      .expect(201);
    expect(uploaded.body.data.photo).toMatchObject({
      mateId: data.mate1.id,
      sortOrder: 0,
    });
    expect(uploaded.body.data.photo.url).toMatch(/^data:image\/png;base64,/);
    await request(app.getHttpServer())
      .post('/api/v1/mates/me/photos')
      .set(auth)
      .send({})
      .expect(400);

    for (let index = 1; index < 6; index++) {
      await request(app.getHttpServer())
        .post('/api/v1/mates/me/photos')
        .set(auth)
        .send({ url: `https://example.com/photo-${index}.jpg` })
        .expect(201);
    }
    await request(app.getHttpServer())
      .post('/api/v1/mates/me/photos')
      .set(auth)
      .send({ url: 'https://example.com/seventh.jpg' })
      .expect(409);
    expect(
      await db.orm.public.MatePhoto.where({ mateId: data.mate1.id }).all(),
    ).toHaveLength(6);
  });

  it('PHOTO-06/07 deletes only an owned photo and reuses the first free sort order', async () => {
    const own = await db.orm.public.MatePhoto.create({
      mateId: data.mate1.id,
      url: 'https://example.com/own.jpg',
      storageKey: null,
      sortOrder: 0,
    });
    const other = await db.orm.public.MatePhoto.create({
      mateId: data.mate2.id,
      url: 'https://example.com/other.jpg',
      storageKey: null,
      sortOrder: 0,
    });
    await request(app.getHttpServer())
      .delete(`/api/v1/mates/me/photos/${other.id}`)
      .set(bearer(tokens.mate1))
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/mates/me/photos/${own.id}`)
      .set(bearer(tokens.mate1))
      .expect(200);
    const replacement = await request(app.getHttpServer())
      .post('/api/v1/mates/me/photos')
      .set(bearer(tokens.mate1))
      .send({ url: 'https://example.com/replacement.jpg' })
      .expect(201);
    expect(replacement.body.data.photo.sortOrder).toBe(0);
  });

  it('AVAIL-01/02/03 creates sorted slots and rejects malformed or overlapping ranges', async () => {
    await db.orm.public.MateAvailability.where({
      mateId: data.mate1.id,
    }).deleteAndCount();
    const auth = bearer(tokens.mate1);
    await request(app.getHttpServer())
      .post('/api/v1/mates/me/availability')
      .set(auth)
      .send({ dayOfWeek: 'MON', startTime: '13:00', endTime: '15:00' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/mates/me/availability')
      .set(auth)
      .send({ dayOfWeek: 1, startTime: '09:00', endTime: '12:00' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/mates/me/availability')
      .set(auth)
      .send({ dayOfWeek: 1, startTime: '11:00', endTime: '14:00' })
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/v1/mates/me/availability')
      .set(auth)
      .send({ dayOfWeek: 8, startTime: '15:00', endTime: '14:00' })
      .expect(400);

    const response = await request(app.getHttpServer())
      .get('/api/v1/mates/me/availability')
      .set(auth)
      .expect(200);
    expect(
      response.body.data.availability.map(
        (slot: { startTime: string }) => slot.startTime,
      ),
    ).toEqual(['09:00', '13:00']);
  });

  it('AVAIL-04/05/06 replaces, updates, and deletes the weekly schedule', async () => {
    const auth = bearer(tokens.mate1);
    const replaced = await request(app.getHttpServer())
      .put('/api/v1/mates/me/availability')
      .set(auth)
      .send({ slots: [{ dayOfWeek: 2, startTime: '08:00', endTime: '10:00' }] })
      .expect(200);
    expect(replaced.body.data.slots).toHaveLength(1);
    const slotId = replaced.body.data.slots[0].id;

    await request(app.getHttpServer())
      .patch(`/api/v1/mates/me/availability/${slotId}`)
      .set(auth)
      .send({ endTime: '11:00' })
      .expect(200)
      .expect(({ body }) =>
        expect(body.data.availability.endTime).toBe('11:00'),
      );
    await request(app.getHttpServer())
      .patch(`/api/v1/mates/me/availability/${slotId}`)
      .set(auth)
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .delete(`/api/v1/mates/me/availability/${slotId}`)
      .set(auth)
      .expect(204);
    await request(app.getHttpServer())
      .delete(`/api/v1/mates/me/availability/${slotId}`)
      .set(auth)
      .expect(404);
  });

  it('AVAIL-08/10/11 returns public open slots after subtracting blocking bookings', async () => {
    const date = getFutureDate(2);
    await createBookingRow({
      renterId: data.renter1.id,
      mateId: data.mate1.id,
      activityId: data.activity1.id,
      date,
      startTime: '10:00',
      endTime: '11:30',
      status: 'pending',
    });
    await createBookingRow({
      renterId: data.renter2.id,
      mateId: data.mate1.id,
      activityId: data.activity1.id,
      date,
      startTime: '13:00',
      endTime: '14:00',
      status: 'cancelled',
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/mates/${data.mate1.id}/availability`)
      .query({ date })
      .expect(200);
    expect(response.body.data.openSlots).toEqual([
      { start: '09:00', end: '10:00' },
      { start: '11:30', end: '18:00' },
    ]);
  });

  it('SEARCH-01/02/04/05/08/09 filters, sorts, and paginates public mates', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/mates')
      .query({
        q: 'experienced mover',
        activityId: data.activity1.id,
        interestId: data.interest1.id,
        provinceId: data.province.id,
        districtId: data.district.id,
        minRate: '400',
        maxRate: '550',
        minRating: 0,
        sort: 'rate',
        page: 1,
        limit: 1,
      })
      .expect(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({
      id: data.mate1.id,
      name: data.mateUser1.name,
      hourlyRate: 500,
      avgRating: null,
    });
    expect(response.body.data.meta).toMatchObject({
      page: 1,
      limit: 1,
      total: 1,
      totalPages: 1,
    });
  });

  it('SEARCH-03/10 rejects invalid combinations and query bounds', async () => {
    const otherProvince = (await db.orm.public.Province.all()).find(
      (province) => province.id !== data.province.id,
    );
    expect(otherProvince).not.toBeNull();

    await request(app.getHttpServer())
      .get('/api/v1/mates')
      .query({ provinceId: otherProvince!.id, districtId: data.district.id })
      .expect(422);
    await request(app.getHttpServer())
      .get('/api/v1/mates')
      .query({ minRate: 500, maxRate: 100 })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/mates')
      .query({ sort: 'name' })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/mates')
      .query({ limit: 101 })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/mates')
      .query({ availableDate: '2026-02-30' })
      .expect(422);
  });

  it('SEARCH-11/12 hides banned owners and returns safe public detail', async () => {
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/mates/${data.mate1.id}`)
      .expect(200);
    expect(detail.body.data.mate).toMatchObject({
      id: data.mate1.id,
      user: { id: data.mateUser1.id },
    });
    expect(JSON.stringify(detail.body)).not.toContain(data.mateUser1.email);
    expect(JSON.stringify(detail.body)).not.toContain('password');

    await db.orm.public.User.where({ id: data.mateUser1.id }).update({
      isBanned: true,
    });
    await request(app.getHttpServer())
      .get(`/api/v1/mates/${data.mate1.id}`)
      .expect(404);
    const search = await request(app.getHttpServer())
      .get('/api/v1/mates')
      .expect(200);
    expect(
      search.body.data.items.map((mate: { id: number }) => mate.id),
    ).not.toContain(data.mate1.id);
  });
});

async function accessToken(
  app: INestApplication<App>,
  email: string,
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD })
    .expect(201);
  return response.body.data.accessToken as string;
}

function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

async function createBookingRow(input: {
  renterId: number;
  mateId: number;
  activityId: number;
  date: string;
  startTime: string;
  endTime: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
}) {
  const date = Temporal.PlainDate.from(input.date);
  const at = (time: string) =>
    date
      .toZonedDateTime({ timeZone: 'Asia/Bangkok', plainTime: time })
      .toInstant();
  return db.orm.public.Booking.create({
    renterId: input.renterId,
    mateId: input.mateId,
    activityId: input.activityId,
    date: at('00:00'),
    startTime: at(input.startTime),
    endTime: at(input.endTime),
    totalPrice: '500.00',
    status: input.status,
  });
}
