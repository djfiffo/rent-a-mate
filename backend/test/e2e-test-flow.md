# E2E Integration Test Flow สำหรับ Booking + Notification

## แนวทางทั่วไป

Test flow ดำเนินไปตามลำดับต่อไปนี้ (dependency-based) โดยแต่ละ test group เตรียม state สำหรับ group ถัดไป

## Test Structure (TypeScript + supertest + vitest)

```
test/
├── fixtures/
│   ├── test-data.ts — factory functions สร้าง test users/mates/activities
│   ├── test-setup.ts — beforeAll/afterEach hooks สำหรับ DB seeding/cleanup
│   └── auth-helpers.ts — login helper, token storage
├── bookings.e2e.spec.ts — ทุก booking + notification test cases
└── README.md — documentation
```

---

## Test Flow Diagram

```
START
  ↓
[Setup] Database cleanup + seed
  ├─ Create users (renter1, renter2, mate1, mate2, admin)
  ├─ Create mate profiles + activities
  ├─ Create mate-activity mapping
  ├─ Set availability for mate1
  └─ Login all users → collect tokens
  ↓
[Group A] Auth/Setup verification ✓
  ├─ A1. Login succeeds → get tokens
  └─ A2. Token stored in environment
  ↓
[Group B] POST /bookings — Normal case ✓
  ├─ B1. Create booking (renter1 → mate1) → 201, status='pending', totalPrice calculated
  ├─ B2. Verify notification 'booking_requested' sent to mate1
  └─ [Store bookingId1 for next groups]
  ↓
[Group C] POST /bookings — Edge cases (validation errors)
  ├─ C1. Non-existent mateId → 404
  ├─ C2. Self-booking → 400
  ├─ C3. Inactive mate → 422
  ├─ C4. Non-existent activityId → 404
  ├─ C5. Unlisted activity (mate ไม่มี this activity) → 422
  ├─ C6. Date format ผิด → 400 (DTO validation)
  ├─ C7. Time format ผิด → 400 (DTO validation)
  ├─ C8. startTime >= endTime → 400
  ├─ C9. Past time → 422 (ต้องสร้าง booking ใน "future" ผ่าน DB direct หรือ freeze time)
  ├─ C10. Duration ไม่ใช่ 30-min step → 422
  ├─ C11. Duration < 1 hour → 422
  ├─ C12. Duration > 8 hours → 422
  ├─ C13. Duration boundary (1h, 8h) → 200 ✓
  ├─ C14. Outside availability → 422
  ├─ C15. Overlapping with existing (pending/confirmed):
  │    ├─ C15a. Exact overlap
  │    ├─ C15b. Partial overlap
  │    └─ C15c. Adjacent (10:00-11:00 + 11:00-12:00) → 200 ✓
  ├─ C16. Overlapping with cancelled/declined booking → 200 ✓ (ไม่กันเวลา)
  ├─ C17. Non-renter role (mate/admin) → 403 @Roles
  └─ C18. Banned user → 403 RolesGuard
  ↓
[Group D] GET /bookings + GET /bookings/:id
  ├─ D1. renter1 GET /bookings → เห็น booking ที่ renter1 เป็น renter เท่านั้น
  ├─ D2. mate1 GET /bookings → เห็น booking ที่ mate1's mateId เท่านั้น
  ├─ D3. admin GET /bookings → ได้ list ว่าง (admin ไม่ใช่ renter/mate ใน booking ใดๆ)
  ├─ D4. ?status=pending filter works
  ├─ D5. Pagination (?page, ?limit) meta คำนวณถูก
  ├─ D6. GET /bookings/:bookingId (คู่กรณี) → เห็น detail + renter/mate/activity names
  ├─ D7. GET /bookings/:bookingId (admin) → เห็น detail (bypass)
  ├─ D8. GET /bookings/:bookingId (non-participant) → 404 (ซ่อน)
  └─ D9. GET /bookings/:bookingId (ไม่มี id) → 404
  ↓
[Group E] PATCH /bookings/:id/accept + /decline
  ├─ E1. mate1 accept booking1 (pending) → 200, status='confirmed', notification 'booking_confirmed' to renter1
  ├─ [Store acceptedBookingId = booking1.id]
  ├─ E2. Create booking2 (renter1 → mate1, different time) + mate1 decline → 200, status='cancelled', notification 'booking_declined' to renter1
  ├─ [Store declinedBookingId = booking2.id]
  ├─ E3. mate1 accept again (already confirmed) → 200 idempotent (ไม่ error)
  ├─ E4. mate1 try to decline confirmed → 422 INVALID_BOOKING_TRANSITION
  ├─ E5. Accept cancelled/completed booking → 422
  ├─ E6. mate2 try to accept booking of mate1 → 403 ownership check
  ├─ E7. renter/admin PATCH accept → 403 @Roles('mate')
  └─ E8. accept/decline non-existent bookingId → 404
  ↓
[Group F] PATCH /bookings/:id/cancel
  ├─ F1. Create booking3 (future time, pending) + renter1 cancel → 200, status='cancelled', mate1 notified
  ├─ F2. Create booking4 (future, pending) + mate1 cancel → 200, renter1 notified
  ├─ F3. Create booking5 + admin cancel → 200, **both** renter1 and mate1 notified
  ├─ F4. cancel again (already cancelled) → 200 idempotent
  ├─ F5. cancel completed booking → 422
  ├─ F6. cancel after startTime passed → 422 (need to mock time or use future time from B1)
  └─ F7. non-participant cancel → 403
  ↓
[Group G] PATCH /bookings/:id/complete
  ├─ G1. Create booking6 (confirmed, mock endTime passed) + mate1 complete → 200, status='completed', renter1 notified
  ├─ [Note: G1 ต้อง mock Temporal.Now.instant() หรือจัดการเวลาให้ endTime < now]
  ├─ G2. admin complete booking6 → 200 (bypass)
  ├─ G3. complete again (already completed) → 200 idempotent
  ├─ G4. complete pending booking → 422 INVALID_BOOKING_TRANSITION
  ├─ G5. complete before endTime → 422
  └─ G6. renter/non-owner complete → 403
  ↓
[Group H] Notifications endpoints
  ├─ H1. GET /notifications → list for current user, newest first
  ├─ H2. GET /notifications?unreadOnly=true → filter unread
  ├─ H3. PATCH /notifications/:id/read → mark as read
  ├─ H4. read again (idempotent) → no error
  ├─ H5. read other user's notification → 404
  ├─ H6. PATCH /notifications/read-all → mark all unread as read, return { updated: count }
  ├─ H7. read-all when no unread → { updated: 0 }
  └─ H8. Verify notification types match table:
  │    ├─ booking_requested (from B1, B2, etc.)
  │    ├─ booking_confirmed (from E1)
  │    ├─ booking_declined (from E2)
  │    ├─ booking_cancelled (from F1, F2, F3)
  │    └─ booking_completed (from G1)
  ↓
[Group I] Security + Cross-cutting
  ├─ I1. No JWT → 401 (ทุก endpoint)
  ├─ I2. Expired JWT → 401
  ├─ I3. Banned user on non-@Roles endpoint (e.g. cancel/complete/GET) → 403 (RolesGuard catches ban always)
  └─ I4. Race condition test (concurrent requests): 2 requests สั่งจองเวลาเดียวกัน mate เดียวกัน → ≥1 ต้อง 409 conflict
  ↓
CLEANUP: Reset database
  ↓
END ✓
```

---

## Implementation Notes

### 1. Database Seeding (test/fixtures/test-setup.ts)

```typescript
import { db } from '../../src/prisma/db.js';
import bcrypt from 'bcrypt';

export async function seedTestDatabase() {
  // Clean first
  await Promise.all([
    db.orm.public.Booking.where((b) => b.id.gt(0)).delete(),
    db.orm.public.Notification.where((n) => n.id.gt(0)).delete(),
    db.orm.public.MateActivity.where((ma) => ma.id.gt(0)).delete(),
    db.orm.public.Mate.where((m) => m.id.gt(0)).delete(),
    db.orm.public.Activity.where((a) => a.id.gt(0)).delete(),
    db.orm.public.User.where((u) => u.id.gt(0)).delete(),
  ]);

  // Create users
  const renter1 = await db.orm.public.User.create({
    email: 'renter1@test.com',
    password: await bcrypt.hash('password', 12),
    name: 'Renter One',
    role: 'renter',
  });
  const renter2 = await db.orm.public.User.create({
    email: 'renter2@test.com',
    password: await bcrypt.hash('password', 12),
    name: 'Renter Two',
    role: 'renter',
  });
  const mateUser1 = await db.orm.public.User.create({
    email: 'mate1@test.com',
    password: await bcrypt.hash('password', 12),
    name: 'Mate One',
    role: 'mate',
  });
  const mateUser2 = await db.orm.public.User.create({
    email: 'mate2@test.com',
    password: await bcrypt.hash('password', 12),
    name: 'Mate Two',
    role: 'mate',
  });
  const admin = await db.orm.public.User.create({
    email: 'admin@test.com',
    password: await bcrypt.hash('password', 12),
    name: 'Admin',
    role: 'admin',
  });

  // Create activities
  const activity1 = await db.orm.public.Activity.create({
    name: 'Moving',
    description: 'Help with moving',
  });
  const activity2 = await db.orm.public.Activity.create({
    name: 'Cleaning',
    description: 'Help with cleaning',
  });

  // Create mate profiles
  const mate1 = await db.orm.public.Mate.create({
    userId: mateUser1.id,
    hourlyRate: '500.00',
    isActive: true,
    bio: 'Experienced mover',
  });
  const mate2 = await db.orm.public.Mate.create({
    userId: mateUser2.id,
    hourlyRate: '600.00',
    isActive: true,
    bio: 'Experienced cleaner',
  });

  // Link mate activities
  await db.orm.public.MateActivity.create({ mateId: mate1.id, activityId: activity1.id });
  await db.orm.public.MateActivity.create({ mateId: mate2.id, activityId: activity2.id });

  // Set availability (mate1 available 09:00-18:00 every day)
  await db.orm.public.MateAvailability.create({
    mateId: mate1.id,
    dayOfWeek: 0, // Sunday
    startTime: '09:00',
    endTime: '18:00',
  });
  // ... repeat for Mon-Sat

  return { renter1, renter2, mateUser1, mateUser2, admin, mate1, mate2, activity1, activity2 };
}

export async function cleanupTestDatabase() {
  await Promise.all([
    db.orm.public.Booking.where((b) => b.id.gt(0)).delete(),
    db.orm.public.Notification.where((n) => n.id.gt(0)).delete(),
    db.orm.public.MateActivity.where((ma) => ma.id.gt(0)).delete(),
    db.orm.public.Mate.where((m) => m.id.gt(0)).delete(),
    db.orm.public.Activity.where((a) => a.id.gt(0)).delete(),
    db.orm.public.User.where((u) => u.id.gt(0)).delete(),
  ]);
}
```

### 2. Test File Structure (test/bookings.e2e.spec.ts)

```typescript
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';
import { seedTestDatabase, cleanupTestDatabase } from './fixtures/test-setup.js';

describe('Booking & Notification E2E Tests', () => {
  let app: any;
  let testData: any;
  let tokens: any = {};

  beforeAll(async () => {
    // Start app
    app = await NestFactory.create(AppModule);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    // Seed DB
    testData = await seedTestDatabase();

    // Login all users
    for (const [role, email] of Object.entries({
      renter1: 'renter1@test.com',
      renter2: 'renter2@test.com',
      mate1: 'mate1@test.com',
      mate2: 'mate2@test.com',
      admin: 'admin@test.com',
    })) {
      const res = await request(app)
        .post('/auth/login')
        .send({ email, password: 'password' });
      tokens[role] = res.body.data.accessToken;
    }
  });

  afterEach(async () => {
    // Optional: can clear bookings only if needed
  });

  describe('[Group B] POST /bookings - Normal case', () => {
    it('B1. Should create booking successfully', async () => {
      const testDate = '2025-10-15'; // Future date
      const res = await request(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${tokens.renter1}`)
        .send({
          mateId: testData.mate1.id,
          activityId: testData.activity1.id,
          date: testDate,
          startTime: '10:00',
          endTime: '11:30',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.totalPrice).toBeDefined();
      // Store for later groups
      global.bookingId1 = res.body.data.id;
    });

    it('B2. Should send booking_requested notification to mate', async () => {
      const res = await request(app)
        .get('/notifications')
        .set('Authorization', `Bearer ${tokens.mate1}`);

      expect(res.status).toBe(200);
      const notification = res.body.data.notifications.find(
        (n: any) => n.type === 'booking_requested' && n.bookingId === global.bookingId1
      );
      expect(notification).toBeDefined();
      expect(notification.message).toContain('new booking request');
    });
  });

  describe('[Group C] POST /bookings - Edge cases', () => {
    it('C1. Should reject non-existent mateId', async () => {
      const res = await request(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${tokens.renter1}`)
        .send({
          mateId: 99999,
          activityId: testData.activity1.id,
          date: '2025-10-15',
          startTime: '10:00',
          endTime: '11:30',
        });

      expect(res.status).toBe(404);
      expect(res.body.data.message).toContain('Mate not found');
    });

    it('C2. Should reject self-booking', async () => {
      const res = await request(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${tokens.mate1}`)
        .send({
          mateId: testData.mate1.id,
          activityId: testData.activity1.id,
          date: '2025-10-15',
          startTime: '10:00',
          endTime: '11:30',
        });

      expect(res.status).toBe(400);
      expect(res.body.data.message).toContain('cannot book yourself');
    });

    // ... more edge cases following the same pattern
  });

  describe('[Group D] GET /bookings & GET /bookings/:id', () => {
    it('D1. Renter should see only their own bookings', async () => {
      const res = await request(app)
        .get('/bookings')
        .set('Authorization', `Bearer ${tokens.renter1}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: global.bookingId1 }),
        ])
      );
    });

    // ... more tests
  });

  // [Group E], [Group F], [Group G], [Group H], [Group I] similar structure
});
```

### 3. Running Tests

```bash
# Run all e2e tests
npx vitest run test/bookings.e2e.spec.ts

# Run with verbose output
npx vitest run test/bookings.e2e.spec.ts --reporter=verbose

# Run in watch mode (development)
npx vitest test/bookings.e2e.spec.ts --watch

# Run with coverage
npx vitest run test/bookings.e2e.spec.ts --coverage

# Run specific group only
npx vitest run test/bookings.e2e.spec.ts -t "Group B"
```

---

## Key Testing Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| **Time-sensitive tests** (past time, after endTime) | Mock `Temporal.Now.instant()` via fixture, or use DB direct insert with past/future dates |
| **Concurrent race condition test** | Use `Promise.all()` to fire 2+ requests simultaneously, expect ≥1 to fail with 409 |
| **Database state management** | `beforeAll()` seed + `afterEach()` cleanup (or wrap each test in transaction + rollback) |
| **Token storage across tests** | `global` object or Vitest context, store tokens after login |
| **Checking notifications** | After action, call `GET /notifications` with the affected user's token |

---

## Test Execution Order

1. **Setup** (beforeAll)
2. **Group B** (POST normal)
3. **Group C** (POST validation errors)
4. **Group D** (GET list/detail)
5. **Group E** (accept/decline with booking from B)
6. **Group F** (cancel with new bookings)
7. **Group G** (complete with mocked time)
8. **Group H** (notification endpoints, validate types from earlier groups)
9. **Group I** (security cross-cutting)
10. **Cleanup** (afterEach/afterAll)

---

## Expected Outcome

- ✅ All 60+ test cases pass
- ✅ Coverage report shows bookings service/controller fully covered
- ✅ Can be run locally (`npm run test:e2e`) or in CI/CD
- ✅ Clear error messages on failure (expected vs. actual)
