# E2E Test Implementation Guide

## Files Created

1. **`backend/test/e2e-test-flow.md`** — Comprehensive flow diagram + implementation notes
2. **`backend/test/fixtures/test-setup.ts`** — Database seeding & cleanup helpers

## Quick Start

### 1. Create Integration Test File

Create `backend/test/bookings.e2e.spec.ts` following the structure in `e2e-test-flow.md`.

```bash
touch backend/test/bookings.e2e.spec.ts
```

### 2. Import & Use Fixtures

```typescript
import { seedTestDatabase, cleanupTestDatabase, getFutureDate } from './fixtures/test-setup.js';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
```

### 3. Structure Each Test Group

```typescript
describe('[Group B] POST /bookings', () => {
  it('B1. Should create booking', async () => {
    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${tokens.renter1}`)
      .send({
        mateId: testData.mate1.id,
        activityId: testData.activity1.id,
        date: getFutureDate(1),
        startTime: '10:00',
        endTime: '11:30',
      });
    
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
  });
});
```

### 4. Run Tests

```bash
# Run all e2e tests
npx vitest run test/bookings.e2e.spec.ts

# Run with verbose output
npx vitest run test/bookings.e2e.spec.ts --reporter=verbose

# Watch mode (auto-rerun on changes)
npx vitest test/bookings.e2e.spec.ts --watch

# Run specific test group
npx vitest run test/bookings.e2e.spec.ts -t "Group B"
```

## Test Execution Flow (Dependencies)

```
Setup (seed DB)
  ↓
Group B: POST /bookings (normal) ← stores bookingId1
  ↓
Group C: POST /bookings (validation errors)
  ↓
Group D: GET /bookings + GET /bookings/:id (uses bookingId1)
  ↓
Group E: accept/decline (uses bookingId1 from B, creates new bookings for decline test)
  ↓
Group F: cancel (creates new bookings)
  ↓
Group G: complete (mocks time, creates new bookings with confirmed status)
  ↓
Group H: Notifications (verify types from B/E/F/G actions)
  ↓
Group I: Security cross-cutting (JWT validation, ban checks, race conditions)
  ↓
Cleanup (reset DB)
```

## Key Testing Patterns

### Login & Token Storage

```typescript
let tokens: any = {};

beforeAll(async () => {
  for (const [key, email] of Object.entries({
    renter1: 'renter1@test.com',
    mate1: 'mate1@test.com',
  })) {
    const res = await request(app)
      .post('/auth/login')
      .send({ email, password: 'password' });
    tokens[key] = res.body.data.accessToken;
  }
});
```

### Use Authorization Header

```typescript
const res = await request(app)
  .post('/bookings')
  .set('Authorization', `Bearer ${tokens.renter1}`);
```

### Verify Response Shape

```typescript
expect(res.body).toMatchObject({
  status: 'success',
  data: {
    id: expect.any(Number),
    status: 'pending',
    totalPrice: expect.any(String),
  },
});
```

### Check Notifications

```typescript
const notifications = await getNotificationsForUser(testData.mate1.id);
const booking_requested = findNotification(notifications, 'booking_requested', bookingId);
expect(booking_requested).toBeDefined();
```

### Store Values for Reuse

```typescript
// In test:
const res = await request(app).post('/bookings').send(...);
global.bookingId1 = res.body.data.id;

// In next test:
await request(app)
  .patch(`/bookings/${global.bookingId1}/accept`)
  .set('Authorization', `Bearer ${tokens.mate1}`);
```

## Database State Management

### Clean Between Tests (recommended)

```typescript
afterEach(async () => {
  await cleanupTestDatabase();
  const testData = await seedTestDatabase();
});
```

### Or Clean Once After All

```typescript
afterAll(async () => {
  await cleanupTestDatabase();
});
```

## Time-Sensitive Tests

For tests that check "cannot cancel after startTime":

```typescript
// Option 1: Use past date (won't work for future-checking booking creation)
// Option 2: Insert booking directly in DB with past startTime
// Option 3: Mock Temporal.Now.instant() (more complex)

// Simple approach: directly manipulate DB
await db.orm.public.Booking.where({ id: bookingId }).update({
  startTime: Temporal.Now.instant().subtract({ hours: 1 }),
});
```

## Concurrent/Race Test

```typescript
it('I4. Race condition: two simultaneous bookings for same slot', async () => {
  const results = await Promise.allSettled([
    request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${tokens.renter1}`)
      .send({ mateId: testData.mate1.id, activityId: testData.activity1.id, date, startTime: '10:00', endTime: '11:30' }),
    request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${tokens.renter2}`)
      .send({ mateId: testData.mate1.id, activityId: testData.activity1.id, date, startTime: '10:00', endTime: '11:30' }),
  ]);
  
  // At least one should fail with 409
  const statuses = results
    .filter((r) => r.status === 'fulfilled')
    .map((r: any) => r.value.status);
  
  expect(statuses).toContain(409);
});
```

## Next Steps

1. **Create `backend/test/bookings.e2e.spec.ts`** with all groups B–I (use flow diagram as reference)
2. **Run tests**: `npx vitest run test/bookings.e2e.spec.ts`
3. **Fix failures**: debug & iterate
4. **Add to CI/CD**: create GitHub Actions workflow to run e2e tests on PR
5. **Optional**: export Postman Collection from test metadata (not covered in this guide)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Cannot find module 'supertest'` | `npm install supertest @types/supertest` |
| Tests timeout | Increase Vitest timeout: `it('...', async () => {...}, 10000)` |
| Database locks | Use `afterEach` cleanup, not `afterAll` |
| Token expired mid-test | Use 2h access token (already set in auth changes) |
| Temporal errors | Import `import { Temporal } from '@js-temporal/polyfill'` |
| App not starting in tests | Make sure `NestFactory.create()` + `.init()` + `.listen()` |

---

Good luck with testing! 🚀
