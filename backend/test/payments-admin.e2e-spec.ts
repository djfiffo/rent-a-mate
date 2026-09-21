import { Temporal } from '@js-temporal/polyfill';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/prisma/db.js';
import { createE2eApp, type FakeStripeProvider, type StripeEvent } from './fixtures/e2e-app.js';
import { cleanupTestDatabase, seedTestDatabase, type TestData } from './fixtures/test-setup.js';

const PASSWORD = 'password123';

describe('Payments, webhooks, reports, and admin APIs (e2e)', () => {
  let app: INestApplication<App>;
  let stripe: FakeStripeProvider;
  let data: TestData;
  let tokens: Record<string, string>;

  beforeAll(async () => {
    ({ app, stripe } = await createE2eApp());
  });

  beforeEach(async () => {
    stripe.reset();
    data = await seedTestDatabase();
    tokens = {
      renter1: await login(app, data.renter1.email),
      renter2: await login(app, data.renter2.email),
      mate1: await login(app, data.mateUser1.email),
      mate2: await login(app, data.mateUser2.email),
      admin: await login(app, data.admin.email),
    };
  });

  afterAll(async () => {
    await cleanupTestDatabase();
    await app.close();
  });

  it('PAY-01/02/03/09 creates one intent, resumes it, and exposes participant status', async () => {
    const booking = await directBooking(data, { status: 'confirmed', daysFromNow: 2, totalPrice: '750.25' });
    const paymentPath = `/api/v1/bookings/${booking.id}/payment`;

    const virtual = await request(app.getHttpServer())
      .get(paymentPath)
      .set(bearer(tokens.mate1))
      .expect(200);
    expect(virtual.body.data).toMatchObject({ bookingId: booking.id, status: 'pending', providerReference: null });
    expect(await db.orm.public.Payment.where({ bookingId: booking.id }).first()).toBeNull();

    const first = await request(app.getHttpServer())
      .post(paymentPath)
      .set(bearer(tokens.renter1))
      .expect(201);
    expect(first.body.data).toMatchObject({ bookingId: booking.id, status: 'pending' });
    expect(first.body.data.clientSecret).toMatch(/^pi_e2e_/);
    expect(stripe.createdIntents).toEqual([
      {
        params: { amount: 75025, currency: 'thb', metadata: { bookingId: String(booking.id) } },
        options: { idempotencyKey: `booking-${booking.id}-payment` },
      },
    ]);

    const second = await request(app.getHttpServer())
      .post(paymentPath)
      .set(bearer(tokens.renter1))
      .expect(201);
    expect(second.body.data.clientSecret).toBe(first.body.data.clientSecret);
    expect(stripe.createdIntents).toHaveLength(1);
    expect(stripe.retrievedIntents).toHaveLength(1);
  });

  it('PAY-05/06/07 enforces booking state, renter ownership, and refund state', async () => {
    const pending = await directBooking(data, { status: 'pending', daysFromNow: 2 });
    await request(app.getHttpServer())
      .post(`/api/v1/bookings/${pending.id}/payment`)
      .set(bearer(tokens.renter1))
      .expect(422);

    const confirmed = await directBooking(data, { status: 'confirmed', daysFromNow: 3 });
    const path = `/api/v1/bookings/${confirmed.id}/payment`;
    await request(app.getHttpServer()).post(path).set(bearer(tokens.renter2)).expect(404);
    await request(app.getHttpServer()).post(path).set(bearer(tokens.mate1)).expect(403);
    await request(app.getHttpServer()).post(path).set(bearer(tokens.admin)).expect(403);

    await db.orm.public.Payment.create({
      bookingId: confirmed.id,
      amount: confirmed.totalPrice,
      status: 'refunded',
      providerReference: 'pi_refunded',
    });
    await request(app.getHttpServer()).post(path).set(bearer(tokens.renter1)).expect(409);
  });

  it('PAY-04/10/11 and HOOK-01/05 finalize payment once and list it for participants', async () => {
    const booking = await directBooking(data, { status: 'confirmed', daysFromNow: 2 });
    const path = `/api/v1/bookings/${booking.id}/payment`;
    await request(app.getHttpServer()).post(path).set(bearer(tokens.renter1)).expect(201);
    const payment = await db.orm.public.Payment.where({ bookingId: booking.id }).first();
    expect(payment?.providerReference).toEqual(expect.any(String));

    const event: StripeEvent = {
      id: 'evt_paid_once',
      type: 'payment_intent.succeeded',
      data: { object: { id: payment!.providerReference } },
    };
    await sendWebhook(app, event).expect(200).expect({ received: true });
    await sendWebhook(app, event).expect(200);

    const paid = await request(app.getHttpServer()).get(path).set(bearer(tokens.renter1)).expect(200);
    expect(paid.body.data).toMatchObject({ status: 'paid', providerReference: payment!.providerReference });
    expect(paid.body.data.paidAt).toEqual(expect.any(String));
    await request(app.getHttpServer()).post(path).set(bearer(tokens.renter1)).expect(201).expect(({ body }) => {
      expect(body.data).toMatchObject({ status: 'paid', clientSecret: null });
    });

    const history = await request(app.getHttpServer())
      .get('/api/v1/payments')
      .set(bearer(tokens.mate1))
      .query({ page: 1, limit: 20 })
      .expect(200);
    expect(history.body.data.items).toContainEqual(expect.objectContaining({ bookingId: booking.id, status: 'paid' }));
    await request(app.getHttpServer()).get(path).set(bearer(tokens.renter2)).expect(404);

    const paidNotifications = await db.orm.public.Notification.where({
      userId: data.renter1.id,
      bookingId: booking.id,
      type: 'payment_paid',
    }).all();
    expect(paidNotifications).toHaveLength(1);
    expect(await db.orm.public.StripeWebhookEvent.where({ id: event.id }).all()).toHaveLength(1);
  });

  it('HOOK-02/03 dispatches payment failure and refund events', async () => {
    const failedBooking = await directBooking(data, { status: 'confirmed', daysFromNow: 2 });
    const failedPayment = await db.orm.public.Payment.create({
      bookingId: failedBooking.id,
      amount: failedBooking.totalPrice,
      status: 'pending',
      providerReference: 'pi_failed',
    });
    await sendWebhook(app, {
      id: 'evt_failed',
      type: 'payment_intent.payment_failed',
      data: { object: { id: failedPayment.providerReference } },
    }).expect(200);
    expect((await db.orm.public.Payment.where({ id: failedPayment.id }).first())?.status).toBe('failed');

    const refundedBooking = await directBooking(data, { status: 'cancelled', daysFromNow: 3 });
    const refundedPayment = await db.orm.public.Payment.create({
      bookingId: refundedBooking.id,
      amount: refundedBooking.totalPrice,
      status: 'refunding',
      providerReference: 'pi_refunding',
    });
    await sendWebhook(app, {
      id: 'evt_refunded',
      type: 'charge.refunded',
      data: { object: { id: 'ch_e2e', payment_intent: refundedPayment.providerReference } },
    }).expect(200);
    expect((await db.orm.public.Payment.where({ id: refundedPayment.id }).first())?.status).toBe('refunded');
  });

  it('HOOK-04/07 rejects bad signatures and safely records ignored events', async () => {
    const event: StripeEvent = { id: 'evt_bad_signature', type: 'customer.created', data: { object: { id: 'cus_1' } } };
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 'invalid')
      .send(JSON.stringify(event))
      .expect(400);
    expect(await db.orm.public.StripeWebhookEvent.where({ id: event.id }).first()).toBeNull();

    await sendWebhook(app, { ...event, id: 'evt_ignored' }).expect(200);
    expect(await db.orm.public.StripeWebhookEvent.where({ id: 'evt_ignored' }).first()).not.toBeNull();
  });

  it('PAY-12/13/14 lets only admins start an eligible manual refund', async () => {
    const booking = await directBooking(data, { status: 'confirmed', daysFromNow: 2 });
    await db.orm.public.Payment.create({
      bookingId: booking.id,
      amount: booking.totalPrice,
      status: 'paid',
      providerReference: 'pi_admin_refund',
      paidAt: Temporal.Now.instant(),
    });
    const path = `/api/v1/bookings/${booking.id}/payment/refund`;
    await request(app.getHttpServer()).post(path).set(bearer(tokens.renter1)).expect(403);
    await request(app.getHttpServer()).post(path).set(bearer(tokens.admin)).expect(201);
    expect(stripe.createdRefunds).toEqual([
      {
        params: { payment_intent: 'pi_admin_refund' },
        options: { idempotencyKey: `booking-${booking.id}-refund` },
      },
    ]);
    await request(app.getHttpServer()).post(path).set(bearer(tokens.admin)).expect(422);
  });

  it('PAY-15 auto-refunds a paid booking on cancellation and waits for webhook finalization', async () => {
    const booking = await directBooking(data, { status: 'confirmed', daysFromNow: 2 });
    await db.orm.public.Payment.create({
      bookingId: booking.id,
      amount: booking.totalPrice,
      status: 'paid',
      providerReference: 'pi_auto_refund',
      paidAt: Temporal.Now.instant(),
    });
    await request(app.getHttpServer())
      .patch(`/api/v1/bookings/${booking.id}/cancel`)
      .set(bearer(tokens.renter1))
      .expect(200);
    expect((await db.orm.public.Payment.where({ bookingId: booking.id }).first())?.status).toBe('refunding');
    expect(stripe.createdRefunds).toHaveLength(1);

    await sendWebhook(app, {
      id: 'evt_auto_refunded',
      type: 'charge.refunded',
      data: { object: { id: 'ch_auto', payment_intent: 'pi_auto_refund' } },
    }).expect(200);
    expect((await db.orm.public.Payment.where({ bookingId: booking.id }).first())?.status).toBe('refunded');
  });

  it('ADMIN-01/02/03 lists safe users with filters and rejects non-admins', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/users').expect(401);
    await request(app.getHttpServer()).get('/api/v1/admin/users').set(bearer(tokens.renter1)).expect(403);
    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set(bearer(tokens.admin))
      .query({ q: 'renter', role: 'renter', page: 1, limit: 1 })
      .expect(200);
    expect(response.body.data.meta).toMatchObject({ page: 1, limit: 1, total: 2, totalPages: 2 });
    expect(response.body.data.items[0].role).toBe('renter');
    expect(JSON.stringify(response.body)).not.toContain('password');
    await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set(bearer(tokens.admin))
      .query({ role: 'owner' })
      .expect(400);
  });

  it('ADMIN-04/05/06 bans a user, revokes every refresh session, and unbans without restoring sessions', async () => {
    const sessionA = await loginPair(app, data.renter1.email);
    const sessionB = await loginPair(app, data.renter1.email);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${data.admin.id}/ban`)
      .set(bearer(tokens.admin))
      .send({ reason: 'Self' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${data.renter1.id}/ban`)
      .set(bearer(tokens.admin))
      .send({ reason: '  Abuse  ' })
      .expect(200)
      .expect(({ body }) => expect(body.data.user).toMatchObject({ isBanned: true }));

    for (const refreshToken of [sessionA.refreshToken, sessionB.refreshToken]) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    }
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(bearer(sessionA.accessToken))
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${data.renter1.id}/unban`)
      .set(bearer(tokens.admin))
      .expect(200);
    await login(app, data.renter1.email);
  });

  it('ADMIN-07/08 activates users and verifies only mate accounts', async () => {
    await db.orm.public.User.where({ id: data.mateUser1.id }).update({ isActive: false });
    await db.orm.public.Mate.where({ id: data.mate1.id }).update({ isActive: false });
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${data.mateUser1.id}/activate`)
      .set(bearer(tokens.admin))
      .expect(200);
    expect((await db.orm.public.Mate.where({ id: data.mate1.id }).first())?.isActive).toBe(true);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${data.renter1.id}/verify`)
      .set(bearer(tokens.admin))
      .expect(422);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${data.mateUser1.id}/verify`)
      .set(bearer(tokens.admin))
      .expect(200)
      .expect(({ body }) => expect(body.data.user.isVerified).toBe(true));
  });

  it('ADMIN-10 lists and filters all bookings independently of participation', async () => {
    const booking = await directBooking(data, { status: 'confirmed', daysFromNow: 2 });
    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/bookings')
      .set(bearer(tokens.admin))
      .query({ status: 'confirmed', mateId: data.mate1.id, renterId: data.renter1.id, page: 1, limit: 20 })
      .expect(200);
    expect(response.body.data.items).toContainEqual(expect.objectContaining({ id: booking.id, status: 'confirmed' }));
  });

  it('REPORT-01/03/06/07/08 creates related reports and lets admins resolve them', async () => {
    const booking = await directBooking(data, { status: 'confirmed', daysFromNow: 2 });
    const created = await request(app.getHttpServer())
      .post('/api/v1/reports')
      .set(bearer(tokens.renter1))
      .send({ targetType: 'booking', targetId: booking.id, reason: '  Problem  ' })
      .expect(201);
    expect(created.body.data.report).toMatchObject({
      reporterId: data.renter1.id,
      targetType: 'booking',
      targetId: booking.id,
      reason: 'Problem',
      status: 'open',
    });
    await request(app.getHttpServer())
      .post('/api/v1/reports')
      .set(bearer(tokens.renter2))
      .send({ targetType: 'booking', targetId: booking.id, reason: 'Probe' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/reports')
      .set(bearer(tokens.renter1))
      .send({ targetType: 'user', targetId: data.renter1.id, reason: 'Self' })
      .expect(400);

    const list = await request(app.getHttpServer())
      .get('/api/v1/admin/reports')
      .set(bearer(tokens.admin))
      .query({ status: 'open' })
      .expect(200);
    expect(list.body.data.items).toContainEqual(expect.objectContaining({ id: created.body.data.report.id }));
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/reports/${created.body.data.report.id}`)
      .set(bearer(tokens.admin))
      .send({ status: 'actioned', resolutionNote: '  Resolved  ' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.report).toMatchObject({ status: 'actioned', resolutionNote: 'Resolved', resolvedById: data.admin.id });
        expect(body.data.report.resolvedAt).toEqual(expect.any(String));
      });
  });

  it('ANALYTICS-01/03/04/05/06 aggregates daily booking, paid revenue, and active users', async () => {
    const today = Temporal.Now.zonedDateTimeISO('Asia/Bangkok').toPlainDate();
    await directBooking(data, { status: 'completed', daysFromNow: 0, startTime: '00:00', endTime: '01:00' });
    const paidBooking = await directBooking(data, { status: 'confirmed', daysFromNow: 0, startTime: '02:00', endTime: '03:00', totalPrice: '125.50' });
    await db.orm.public.Payment.create({
      bookingId: paidBooking.id,
      amount: '125.50',
      status: 'paid',
      providerReference: 'pi_analytics',
      paidAt: Temporal.Now.instant(),
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/analytics')
      .set(bearer(tokens.admin))
      .query({ from: today.toString(), to: today.toString() })
      .expect(200);
    expect(response.body.data.range).toEqual({ from: today.toString(), to: today.toString() });
    expect(response.body.data.bookingCounts.completed).toBeGreaterThanOrEqual(1);
    expect(response.body.data.bookingCounts.confirmed).toBeGreaterThanOrEqual(1);
    expect(response.body.data.paidRevenue).toBe(125.5);
    expect(response.body.data.daily).toHaveLength(1);
    expect(response.body.data.daily[0]).toMatchObject({ date: today.toString(), paidRevenue: 125.5 });
  });

  it('ANALYTICS-02 rejects invalid and reversed date ranges', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/analytics')
      .set(bearer(tokens.admin))
      .query({ from: '2026-02-30', to: '2026-03-01' })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/admin/analytics')
      .set(bearer(tokens.admin))
      .query({ from: '2026-09-02', to: '2026-09-01' })
      .expect(400);
  });
});

async function login(app: INestApplication<App>, email: string): Promise<string> {
  return (await loginPair(app, email)).accessToken;
}

async function loginPair(app: INestApplication<App>, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD })
    .expect(201);
  return response.body.data as { accessToken: string; refreshToken: string };
}

function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

function sendWebhook(app: INestApplication<App>, event: StripeEvent) {
  return request(app.getHttpServer())
    .post('/api/v1/webhooks/stripe')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', 'e2e-valid-signature')
    .send(JSON.stringify(event));
}

async function directBooking(
  data: TestData,
  input: {
    status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
    daysFromNow: number;
    startTime?: string;
    endTime?: string;
    totalPrice?: string;
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
    totalPrice: input.totalPrice ?? '500.00',
    status: input.status,
  });
}
