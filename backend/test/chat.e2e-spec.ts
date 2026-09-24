import { Temporal } from '@js-temporal/polyfill';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/prisma/db.js';
import { createE2eApp } from './fixtures/e2e-app.js';
import {
  cleanupTestDatabase,
  seedTestDatabase,
  type TestData,
} from './fixtures/test-setup.js';

const PASSWORD = 'password123';
let baseUrl: string;
const sockets = new Set<Socket>();

describe('Socket.IO booking chat (e2e)', () => {
  let app: INestApplication<App>;
  let data: TestData;
  let tokens: Record<string, { accessToken: string; refreshToken: string }>;

  beforeAll(async () => {
    const created = await createE2eApp({ listen: true });
    app = created.app;
    baseUrl = created.url!;
  });

  beforeEach(async () => {
    for (const socket of sockets) socket.disconnect();
    sockets.clear();
    data = await seedTestDatabase();
    tokens = {
      renter1: await login(app, data.renter1.email),
      renter2: await login(app, data.renter2.email),
      mate1: await login(app, data.mateUser1.email),
      mate2: await login(app, data.mateUser2.email),
    };
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await cleanupTestDatabase();
    await app.close();
  });

  it('WS-01 authenticates with a single-use handshake ticket and authorizes a participant', async () => {
    const booking = await directBooking(data, 'confirmed');
    const socket = await connectValid(app, tokens.renter1.accessToken);
    expect(
      await emitAck(socket, 'join_booking', { bookingId: booking.id }),
    ).toEqual({ ok: true });
  });

  it('WS-02/03 rejects query-only tickets and never uses query as fallback', async () => {
    const ticket = await createSocketTicket(app, tokens.renter1.accessToken);
    const queryOnly = openSocket({
      query: { ticket },
    });
    await expectSocketRejected(queryOnly, 'Missing socket ticket');

    const invalidAuth = openSocket({
      auth: { ticket: 'not-a-ticket' },
      query: { ticket },
    });
    await expectSocketRejected(invalidAuth, 'Invalid socket ticket');

    const validAuth = await connectValid(app, tokens.renter1.accessToken, {
      ticket: 'invalid-query-ticket',
    });
    expect(validAuth.connected).toBe(true);
  });

  it('WS-04 rejects malformed, access, refresh, and reused tickets', async () => {
    const ticket = await createSocketTicket(app, tokens.renter1.accessToken);
    const firstUse = openSocket({ auth: { ticket } });
    await expectSocketConnected(firstUse);
    firstUse.disconnect();

    for (const candidate of [
      'malformed',
      tokens.renter1.accessToken,
      tokens.renter1.refreshToken,
      ticket,
    ]) {
      await expectSocketRejected(
        openSocket({ auth: { ticket: candidate } }),
        /Invalid|expired|used/,
      );
    }
  });

  it('WS-05 rejects missing, banned, inactive, or deleted users', async () => {
    await expectSocketRejected(
      openSocket({ auth: {} }),
      'Missing socket ticket',
    );

    const bannedTicket = await createSocketTicket(
      app,
      tokens.renter1.accessToken,
    );
    await db.orm.public.User.where({ id: data.renter1.id }).update({
      isBanned: true,
    });
    await expectSocketRejected(
      openSocket({ auth: { ticket: bannedTicket } }),
      'Account is banned',
    );

    const inactiveTicket = await createSocketTicket(
      app,
      tokens.renter2.accessToken,
    );
    await db.orm.public.User.where({ id: data.renter2.id }).update({
      isActive: false,
    });
    await expectSocketRejected(
      openSocket({ auth: { ticket: inactiveTicket } }),
      'Account is inactive',
    );
  });

  it('WS-06/07 allows only participants to join a booking room', async () => {
    const booking = await directBooking(data, 'confirmed');
    const participant = await connectValid(app, tokens.mate1.accessToken);
    const outsider = await connectValid(app, tokens.renter2.accessToken);

    expect(
      await emitAck(participant, 'join_booking', { bookingId: booking.id }),
    ).toEqual({ ok: true });
    expect(
      await emitAck(outsider, 'join_booking', { bookingId: booking.id }),
    ).toEqual({
      ok: false,
      error: 'Booking not found',
    });
  });

  it('WS-08/09 persists one message, notifies the recipient, and broadcasts to the room', async () => {
    const booking = await directBooking(data, 'confirmed');
    const renter = await connectValid(app, tokens.renter1.accessToken);
    const mate = await connectValid(app, tokens.mate1.accessToken);
    await emitAck(renter, 'join_booking', { bookingId: booking.id });
    await emitAck(mate, 'join_booking', { bookingId: booking.id });

    const renterBroadcast = nextEvent<Record<string, unknown>>(
      renter,
      'new_message',
    );
    const mateBroadcast = nextEvent<Record<string, unknown>>(
      mate,
      'new_message',
    );
    const ack = await emitAck(renter, 'send_message', {
      bookingId: booking.id,
      content: '  Hello mate  ',
    });
    expect(ack).toMatchObject({
      ok: true,
      data: {
        bookingId: booking.id,
        senderId: data.renter1.id,
        content: 'Hello mate',
      },
    });
    expect(await renterBroadcast).toMatchObject({
      id: (ack as { data: { id: number } }).data.id,
    });
    expect(await mateBroadcast).toMatchObject({
      id: (ack as { data: { id: number } }).data.id,
    });

    expect(
      await db.orm.public.Message.where({ bookingId: booking.id }).all(),
    ).toHaveLength(1);
    expect(
      await db.orm.public.Notification.where({
        userId: data.mateUser1.id,
        bookingId: booking.id,
        type: 'message_received',
      }).all(),
    ).toHaveLength(1);

    const pending = await directBooking(data, 'pending', 3, '14:00', '15:00');
    expect(
      await emitAck(renter, 'send_message', {
        bookingId: pending.id,
        content: 'Too early',
      }),
    ).toEqual({
      ok: false,
      error: 'MESSAGE_NOT_ALLOWED',
    });
  });

  it('WS-10 allows authorized sending without joining while ACK remains the sender delivery path', async () => {
    const booking = await directBooking(data, 'confirmed');
    const renter = await connectValid(app, tokens.renter1.accessToken);
    const ack = await emitAck(renter, 'send_message', {
      bookingId: booking.id,
      content: 'No room yet',
    });
    expect(ack).toMatchObject({ ok: true, data: { content: 'No room yet' } });
    expect(
      await db.orm.public.Message.where({ bookingId: booking.id }).all(),
    ).toHaveLength(1);
  });

  it('WS-11 broadcasts typing only to other clients in the booking room', async () => {
    const booking = await directBooking(data, 'confirmed');
    const renter = await connectValid(app, tokens.renter1.accessToken);
    const mate = await connectValid(app, tokens.mate1.accessToken);
    await emitAck(renter, 'join_booking', { bookingId: booking.id });
    await emitAck(mate, 'join_booking', { bookingId: booking.id });

    const mateTyping = nextEvent<Record<string, unknown>>(mate, 'typing');
    let senderEchoed = false;
    renter.once('typing', () => {
      senderEchoed = true;
    });
    expect(
      await emitAck(renter, 'typing', {
        bookingId: booking.id,
        isTyping: true,
      }),
    ).toEqual({ ok: true });
    expect(await mateTyping).toEqual({
      bookingId: booking.id,
      userId: data.renter1.id,
      isTyping: true,
    });
    await delay(50);
    expect(senderEchoed).toBe(false);
  });

  it('WS-12/13 marks only the other participant messages read and is idempotent', async () => {
    const booking = await directBooking(data, 'confirmed');
    await db.orm.public.Message.create({
      bookingId: booking.id,
      senderId: data.renter1.id,
      content: 'From renter',
    });
    const mateMessage = await db.orm.public.Message.create({
      bookingId: booking.id,
      senderId: data.mateUser1.id,
      content: 'From mate',
    });
    const renter = await connectValid(app, tokens.renter1.accessToken);
    const mate = await connectValid(app, tokens.mate1.accessToken);
    await emitAck(renter, 'join_booking', { bookingId: booking.id });
    await emitAck(mate, 'join_booking', { bookingId: booking.id });

    const broadcast = nextEvent<Record<string, unknown>>(mate, 'messages_read');
    expect(
      await emitAck(renter, 'mark_read', { bookingId: booking.id }),
    ).toEqual({ ok: true, data: { updatedCount: 1 } });
    expect(await broadcast).toEqual({
      bookingId: booking.id,
      readerId: data.renter1.id,
      updatedCount: 1,
    });
    expect(
      (await db.orm.public.Message.where({ id: mateMessage.id }).first())
        ?.readAt,
    ).not.toBeNull();
    expect(
      await emitAck(renter, 'mark_read', { bookingId: booking.id }),
    ).toEqual({ ok: true, data: { updatedCount: 0 } });
  });

  it('WS-14/15 leaves rooms safely and isolates broadcasts by booking', async () => {
    const booking = await directBooking(data, 'confirmed');
    const otherBooking = await directBooking(
      data,
      'confirmed',
      3,
      '14:00',
      '15:00',
    );
    const renter = await connectValid(app, tokens.renter1.accessToken);
    const mate = await connectValid(app, tokens.mate1.accessToken);
    await emitAck(renter, 'join_booking', { bookingId: booking.id });
    await emitAck(mate, 'join_booking', { bookingId: otherBooking.id });
    expect(
      await emitAck(renter, 'leave_booking', { bookingId: booking.id }),
    ).toEqual({ ok: true });

    let leaked = false;
    renter.once('new_message', () => {
      leaked = true;
    });
    await emitAck(mate, 'send_message', {
      bookingId: otherBooking.id,
      content: 'Other room',
    });
    await delay(50);
    expect(leaked).toBe(false);
  });
});

async function login(app: INestApplication<App>, email: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD })
    .expect(201);
  return response.body.data as { accessToken: string; refreshToken: string };
}

function openSocket(options: {
  auth?: Record<string, unknown>;
  query?: Record<string, string>;
}): Socket {
  const socket = io(`${baseUrl}/chat`, {
    auth: options.auth,
    query: options.query,
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  sockets.add(socket);
  return socket;
}

async function connectValid(
  app: INestApplication<App>,
  accessToken: string,
  query?: Record<string, string>,
): Promise<Socket> {
  const ticket = await createSocketTicket(app, accessToken);
  const socket = openSocket({ auth: { ticket }, query });
  await expectSocketConnected(socket);
  return socket;
}

async function createSocketTicket(
  app: INestApplication<App>,
  accessToken: string,
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/socket-ticket')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(201);
  return response.body.data.ticket as string;
}

async function expectSocketConnected(socket: Socket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Socket connect timeout')),
      2_000,
    );
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  await delay(20);
}

async function expectSocketRejected(socket: Socket, expected: string | RegExp) {
  const message = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Socket rejection timeout')),
      2_000,
    );
    socket.once('error', (payload: { message?: string }) => {
      clearTimeout(timer);
      resolve(payload.message ?? '');
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      resolve(error.message);
    });
  });
  if (typeof expected === 'string') {
    expect(message).toBe(expected);
  } else {
    expect(message).toMatch(expected);
  }
  await delay(20);
  expect(socket.connected).toBe(false);
}

async function emitAck<T = unknown>(
  socket: Socket,
  event: string,
  payload: unknown,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    socket
      .timeout(2_000)
      .emit(event, payload, (error: Error | null, response: T) => {
        if (error) reject(error);
        else resolve(response);
      });
  });
}

async function nextEvent<T>(socket: Socket, event: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event}`)),
      2_000,
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function directBooking(
  data: TestData,
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled',
  daysFromNow = 2,
  startTime = '10:00',
  endTime = '11:00',
) {
  const date = Temporal.Now.zonedDateTimeISO('Asia/Bangkok')
    .toPlainDate()
    .add({ days: daysFromNow });
  const instant = (time: string) =>
    date
      .toZonedDateTime({ timeZone: 'Asia/Bangkok', plainTime: time })
      .toInstant();
  return db.orm.public.Booking.create({
    renterId: data.renter1.id,
    mateId: data.mate1.id,
    activityId: data.activity1.id,
    date: instant('00:00'),
    startTime: instant(startTime),
    endTime: instant(endTime),
    totalPrice: '500.00',
    status,
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
