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

describe('Bookings, reviews, REST messages, and notifications (e2e)', () => {
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
      renter2: await accessToken(app, data.renter2.email),
      mate1: await accessToken(app, data.mateUser1.email),
      mate2: await accessToken(app, data.mateUser2.email),
      admin: await accessToken(app, data.admin.email),
    };
  });

  afterAll(async () => {
    await cleanupTestDatabase();
    await app.close();
  });

  it('BOOK-01/02 creates a pending booking, calculates price, blocks its slot, and notifies the mate', async () => {
    const date = getFutureDate(2);
    const response = await createBooking(app, tokens.renter1, data, {
      date,
      startTime: '10:00',
      endTime: '11:30',
    }).expect(201);
    expect(response.body.data).toMatchObject({ status: 'pending', totalPrice: '750.00' });

    const booking = await db.orm.public.Booking.where({ id: response.body.data.id }).first();
    expect(booking).toMatchObject({ renterId: data.renter1.id, mateId: data.mate1.id });
    const notifications = await db.orm.public.Notification.where({
      userId: data.mateUser1.id,
      bookingId: response.body.data.id,
    }).all();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('booking_requested');

    const availability = await request(app.getHttpServer())
      .get(`/api/v1/mates/${data.mate1.id}/availability`)
      .query({ date })
      .expect(200);
    expect(availability.body.data.openSlots).toEqual([
      { start: '09:00', end: '10:00' },
      { start: '11:30', end: '18:00' },
    ]);
  });

  it('BOOK-03/04/05/06/08 rejects invalid DTOs, state, ownership, and availability', async () => {
    const date = getFutureDate(2);
    const valid = bookingBody(data, { date, startTime: '10:00', endTime: '11:00' });

    await request(app.getHttpServer()).post('/api/v1/bookings').set(bearer(tokens.renter1)).send({ ...valid, endTime: '10:30' }).expect(422);
    await request(app.getHttpServer()).post('/api/v1/bookings').set(bearer(tokens.renter1)).send({ ...valid, startTime: '11:00', endTime: '10:00' }).expect(400);
    await request(app.getHttpServer()).post('/api/v1/bookings').set(bearer(tokens.renter1)).send({ ...valid, date: 'invalid' }).expect(400);
    await request(app.getHttpServer()).post('/api/v1/bookings').set(bearer(tokens.renter1)).send({ ...valid, totalPrice: 1 }).expect(400);
    await request(app.getHttpServer()).post('/api/v1/bookings').set(bearer(tokens.renter1)).send({ ...valid, mateId: 999999 }).expect(404);
    await request(app.getHttpServer()).post('/api/v1/bookings').set(bearer(tokens.renter1)).send({ ...valid, activityId: data.activity2.id }).expect(422);
    await request(app.getHttpServer()).post('/api/v1/bookings').set(bearer(tokens.renter1)).send({ ...valid, startTime: '18:00', endTime: '19:00' }).expect(422);
    await request(app.getHttpServer()).post('/api/v1/bookings').set(bearer(tokens.mate1)).send(valid).expect(403);
    await request(app.getHttpServer()).post('/api/v1/bookings').set(bearer(tokens.admin)).send(valid).expect(403);
  });

  it('BOOK-09/10 rejects blocking overlaps and allows adjacent or cancelled slots', async () => {
    const date = getFutureDate(2);
    await createBooking(app, tokens.renter1, data, { date, startTime: '10:00', endTime: '11:30' }).expect(201);
    await createBooking(app, tokens.renter2, data, { date, startTime: '10:30', endTime: '12:00' }).expect(409);
    const adjacent = await createBooking(app, tokens.renter2, data, { date, startTime: '11:30', endTime: '12:30' }).expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/bookings/${adjacent.body.data.id}/cancel`)
      .set(bearer(tokens.renter2))
      .expect(200);
    await createBooking(app, tokens.renter1, data, { date, startTime: '11:30', endTime: '12:30' }).expect(201);
  });

  it('BOOK-11/12/13 lists only participant bookings and protects detail from IDOR', async () => {
    const created = await createBooking(app, tokens.renter1, data, {
      date: getFutureDate(2),
      startTime: '10:00',
      endTime: '11:00',
    }).expect(201);
    const bookingId = created.body.data.id;

    const renterList = await request(app.getHttpServer())
      .get('/api/v1/bookings')
      .set(bearer(tokens.renter1))
      .query({ status: 'pending', page: 1, limit: 1 })
      .expect(200);
    expect(renterList.body.data).toMatchObject({ meta: { page: 1, limit: 1, total: 1, totalPages: 1 } });
    expect(renterList.body.data.items[0]).toMatchObject({
      id: bookingId,
      renter: { id: data.renter1.id },
      mate: { id: data.mate1.id },
      activity: { id: data.activity1.id },
      review: null,
    });
    await request(app.getHttpServer()).get(`/api/v1/bookings/${bookingId}`).set(bearer(tokens.mate1)).expect(200);
    await request(app.getHttpServer()).get(`/api/v1/bookings/${bookingId}`).set(bearer(tokens.admin)).expect(200);
    await request(app.getHttpServer()).get(`/api/v1/bookings/${bookingId}`).set(bearer(tokens.renter2)).expect(404);

    const adminOwnList = await request(app.getHttpServer())
      .get('/api/v1/bookings')
      .set(bearer(tokens.admin))
      .expect(200);
    expect(adminOwnList.body.data.items).toEqual([]);
  });

  it('BOOK-14/16/17 accepts idempotently and enforces mate ownership and transition rules', async () => {
    const created = await createBooking(app, tokens.renter1, data, {
      date: getFutureDate(2),
      startTime: '10:00',
      endTime: '11:00',
    }).expect(201);
    const path = `/api/v1/bookings/${created.body.data.id}`;

    await request(app.getHttpServer()).patch(`${path}/accept`).set(bearer(tokens.renter1)).expect(403);
    await request(app.getHttpServer()).patch(`${path}/accept`).set(bearer(tokens.mate2)).expect(403);
    await request(app.getHttpServer()).patch(`${path}/accept`).set(bearer(tokens.mate1)).expect(200);
    await request(app.getHttpServer()).patch(`${path}/accept`).set(bearer(tokens.mate1)).expect(200);
    await request(app.getHttpServer()).patch(`${path}/decline`).set(bearer(tokens.mate1)).expect(422);

    const notifications = await db.orm.public.Notification.where({
      userId: data.renter1.id,
      bookingId: created.body.data.id,
    }).all();
    expect(notifications.filter((item) => item.type === 'booking_confirmed')).toHaveLength(1);
  });

  it('BOOK-15 declines idempotently and releases the slot', async () => {
    const date = getFutureDate(2);
    const created = await createBooking(app, tokens.renter1, data, {
      date,
      startTime: '10:00',
      endTime: '11:00',
    }).expect(201);
    const path = `/api/v1/bookings/${created.body.data.id}/decline`;
    await request(app.getHttpServer()).patch(path).set(bearer(tokens.mate1)).expect(200);
    await request(app.getHttpServer()).patch(path).set(bearer(tokens.mate1)).expect(200);
    await createBooking(app, tokens.renter2, data, { date, startTime: '10:00', endTime: '11:00' }).expect(201);

    const notifications = await db.orm.public.Notification.where({
      userId: data.renter1.id,
      bookingId: created.body.data.id,
    }).all();
    expect(notifications.filter((item) => item.type === 'booking_declined')).toHaveLength(1);
  });

  it('BOOK-18/19 cancels by participants or admin, notifies correct recipients, and is idempotent', async () => {
    const renterBooking = await createBooking(app, tokens.renter1, data, {
      date: getFutureDate(2),
      startTime: '10:00',
      endTime: '11:00',
    }).expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/bookings/${renterBooking.body.data.id}/cancel`)
      .set(bearer(tokens.renter2))
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/bookings/${renterBooking.body.data.id}/cancel`)
      .set(bearer(tokens.renter1))
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/bookings/${renterBooking.body.data.id}/cancel`)
      .set(bearer(tokens.renter1))
      .expect(200);
    const mateNotifications = await db.orm.public.Notification.where({
      userId: data.mateUser1.id,
      bookingId: renterBooking.body.data.id,
    }).all();
    expect(mateNotifications.filter((item) => item.type === 'booking_cancelled')).toHaveLength(1);

    const adminBooking = await createBooking(app, tokens.renter1, data, {
      date: getFutureDate(3),
      startTime: '10:00',
      endTime: '11:00',
    }).expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/bookings/${adminBooking.body.data.id}/cancel`)
      .set(bearer(tokens.admin))
      .expect(200);
    const adminCancellation = await db.orm.public.Notification
      .where({ bookingId: adminBooking.body.data.id, type: 'booking_cancelled' })
      .all();
    expect(new Set(adminCancellation.map((item) => item.userId))).toEqual(
      new Set([data.renter1.id, data.mateUser1.id]),
    );
  });

  it('BOOK-20/21 completes only confirmed past bookings as mate owner or admin', async () => {
    const completed = await directBooking(data, { status: 'confirmed', daysFromNow: -2 });
    await request(app.getHttpServer())
      .patch(`/api/v1/bookings/${completed.id}/complete`)
      .set(bearer(tokens.renter1))
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/bookings/${completed.id}/complete`)
      .set(bearer(tokens.mate1))
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/bookings/${completed.id}/complete`)
      .set(bearer(tokens.mate1))
      .expect(200);

    const future = await directBooking(data, { status: 'confirmed', daysFromNow: 2, startTime: '14:00', endTime: '15:00' });
    await request(app.getHttpServer())
      .patch(`/api/v1/bookings/${future.id}/complete`)
      .set(bearer(tokens.admin))
      .expect(422);
  });

  it('REVIEW-01/03/05 creates one review only after completion and embeds it in booking detail', async () => {
    const booking = await directBooking(data, { status: 'completed', daysFromNow: -2 });
    const created = await request(app.getHttpServer())
      .post(`/api/v1/bookings/${booking.id}/review`)
      .set(bearer(tokens.renter1))
      .send({ rating: 5, comment: 'Excellent' })
      .expect(201);
    expect(created.body.data).toMatchObject({
      bookingId: booking.id,
      renterId: data.renter1.id,
      mateId: data.mate1.id,
      rating: 5,
    });
    await request(app.getHttpServer())
      .post(`/api/v1/bookings/${booking.id}/review`)
      .set(bearer(tokens.renter1))
      .send({ rating: 4 })
      .expect(409);
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/bookings/${booking.id}`)
      .set(bearer(tokens.renter1))
      .expect(200);
    expect(detail.body.data.review).toMatchObject({ id: created.body.data.id, rating: 5 });

    const pending = await directBooking(data, { status: 'pending', daysFromNow: 2, startTime: '14:00', endTime: '15:00' });
    await request(app.getHttpServer())
      .post(`/api/v1/bookings/${pending.id}/review`)
      .set(bearer(tokens.renter1))
      .send({ rating: 5 })
      .expect(422);
  });

  it('REVIEW-06/07/08/10 updates, lists, and deletes reviews with ownership rules', async () => {
    const booking = await directBooking(data, { status: 'completed', daysFromNow: -2 });
    const created = await request(app.getHttpServer())
      .post(`/api/v1/bookings/${booking.id}/review`)
      .set(bearer(tokens.renter1))
      .send({ rating: 3, comment: 'Okay' })
      .expect(201);
    const reviewId = created.body.data.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/reviews/${reviewId}`)
      .set(bearer(tokens.renter2))
      .send({ rating: 1 })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/reviews/${reviewId}`)
      .set(bearer(tokens.renter1))
      .send({ rating: 4 })
      .expect(200);
    const publicReviews = await request(app.getHttpServer())
      .get(`/api/v1/mates/${data.mate1.id}/reviews`)
      .query({ page: 1, limit: 10 })
      .expect(200);
    expect(publicReviews.body.data).toMatchObject({ averageRating: 4, reviewCount: 1 });

    await request(app.getHttpServer())
      .delete(`/api/v1/reviews/${reviewId}`)
      .set(bearer(tokens.admin))
      .expect(200);
    await request(app.getHttpServer()).delete(`/api/v1/reviews/${reviewId}`).set(bearer(tokens.admin)).expect(404);
  });

  it('MSG-01/02/03/04/05/06 persists participant messages and notifications with state gating', async () => {
    const booking = await directBooking(data, { status: 'confirmed', daysFromNow: 2 });
    const path = `/api/v1/bookings/${booking.id}/messages`;
    const sent = await request(app.getHttpServer())
      .post(path)
      .set(bearer(tokens.renter1))
      .send({ content: '  สวัสดีครับ  ' })
      .expect(201);
    expect(sent.body.data).toMatchObject({ bookingId: booking.id, senderId: data.renter1.id, content: 'สวัสดีครับ', readAt: null });

    const list = await request(app.getHttpServer())
      .get(path)
      .set(bearer(tokens.mate1))
      .query({ page: 1, limit: 20 })
      .expect(200);
    expect(list.body.data.items.map((item: { id: number }) => item.id)).toEqual([sent.body.data.id]);
    await request(app.getHttpServer()).get(path).set(bearer(tokens.renter2)).expect(404);
    await request(app.getHttpServer()).post(path).set(bearer(tokens.mate1)).send({ content: '   ' }).expect(400);

    const notification = await db.orm.public.Notification.where({
      userId: data.mateUser1.id,
      bookingId: booking.id,
      type: 'message_received',
    }).all();
    expect(notification).toHaveLength(1);

    const pending = await directBooking(data, { status: 'pending', daysFromNow: 3, startTime: '14:00', endTime: '15:00' });
    await request(app.getHttpServer())
      .post(`/api/v1/bookings/${pending.id}/messages`)
      .set(bearer(tokens.renter1))
      .send({ content: 'Too early' })
      .expect(422);
    await request(app.getHttpServer())
      .get(`/api/v1/bookings/${pending.id}/messages`)
      .set(bearer(tokens.renter1))
      .expect(200);
  });

  it('NOTIFY-01/02/03/04/05 lists, filters, and marks only owned notifications', async () => {
    const ownUnread = await db.orm.public.Notification.create({
      userId: data.renter1.id,
      type: 'booking_confirmed',
      message: 'Unread',
      bookingId: null,
    });
    const ownRead = await db.orm.public.Notification.create({
      userId: data.renter1.id,
      type: 'booking_cancelled',
      message: 'Read',
      bookingId: null,
      isRead: true,
    });
    const other = await db.orm.public.Notification.create({
      userId: data.renter2.id,
      type: 'booking_confirmed',
      message: 'Other',
      bookingId: null,
    });

    const unread = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set(bearer(tokens.renter1))
      .query({ unreadOnly: true })
      .expect(200);
    expect(unread.body.data.notifications.map((item: { id: number }) => item.id)).toEqual([ownUnread.id]);
    expect(unread.body.data.notifications.map((item: { id: number }) => item.id)).not.toContain(ownRead.id);

    await request(app.getHttpServer())
      .patch(`/api/v1/notifications/${other.id}/read`)
      .set(bearer(tokens.renter1))
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/notifications/${ownUnread.id}/read`)
      .set(bearer(tokens.renter1))
      .expect(200);
    await request(app.getHttpServer())
      .patch('/api/v1/notifications/read-all')
      .set(bearer(tokens.renter1))
      .expect(200)
      .expect(({ body }) => expect(body.data.updated).toBe(0));
  });
});

async function accessToken(app: INestApplication<App>, email: string): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD })
    .expect(201);
  return response.body.data.accessToken as string;
}

function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

function bookingBody(
  data: TestData,
  overrides: Partial<{ date: string; startTime: string; endTime: string }> = {},
) {
  return {
    mateId: data.mate1.id,
    activityId: data.activity1.id,
    date: getFutureDate(2),
    startTime: '10:00',
    endTime: '11:00',
    ...overrides,
  };
}

function createBooking(
  app: INestApplication<App>,
  token: string,
  data: TestData,
  overrides: Partial<{ date: string; startTime: string; endTime: string }>,
) {
  return request(app.getHttpServer())
    .post('/api/v1/bookings')
    .set(bearer(token))
    .send(bookingBody(data, overrides));
}

async function directBooking(
  data: TestData,
  input: {
    status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
    daysFromNow: number;
    startTime?: string;
    endTime?: string;
  },
) {
  const date = Temporal.Now.zonedDateTimeISO('Asia/Bangkok').toPlainDate().add({ days: input.daysFromNow });
  const instant = (time: string) => date.toZonedDateTime({ timeZone: 'Asia/Bangkok', plainTime: time }).toInstant();
  return db.orm.public.Booking.create({
    renterId: data.renter1.id,
    mateId: data.mate1.id,
    activityId: data.activity1.id,
    date: instant('00:00'),
    startTime: instant(input.startTime ?? '10:00'),
    endTime: instant(input.endTime ?? '11:00'),
    totalPrice: '500.00',
    status: input.status,
  });
}
