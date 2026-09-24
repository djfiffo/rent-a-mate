import { db } from '../../src/prisma/db.js';
import bcrypt from 'bcrypt';
import { Temporal } from '@js-temporal/polyfill';
import type { UserRecord } from '../../src/users/users.types.js';
import type { ActivityRecordForBooking } from '../../src/bookings/bookings.types.js';
import type { NotificationRecord } from '../../src/notifications/notifications.types.js';

/**
 * Type representing a Mate record from the database.
 * Derived from db.orm.public.Mate.create() return type.
 */
type MateRecord = Awaited<ReturnType<typeof db.orm.public.Mate.create>>;

export interface TestData {
  renter1: UserRecord;
  renter2: UserRecord;
  mateUser1: UserRecord;
  mateUser2: UserRecord;
  admin: UserRecord;
  mate1: MateRecord;
  mate2: MateRecord;
  activity1: ActivityRecordForBooking;
  activity2: ActivityRecordForBooking;
  interest1: { id: number; name: string };
  province: { id: number; name: string };
  district: { id: number; provinceId: number; name: string };
}

const TIMEZONE = 'Asia/Bangkok';

/**
 * Seed test database with users, mates, activities, and availability.
 * Call this in beforeAll hook.
 */
export async function seedTestDatabase(): Promise<TestData> {
  // Clean up first
  await cleanupTestDatabase();

  // Create users
  const renter1 = await db.orm.public.User.create({
    email: 'renter1@test.com',
    password: await bcrypt.hash('password123', 4),
    name: 'Renter One',
    role: 'renter',
  });

  const renter2 = await db.orm.public.User.create({
    email: 'renter2@test.com',
    password: await bcrypt.hash('password123', 4),
    name: 'Renter Two',
    role: 'renter',
  });

  const mateUser1 = await db.orm.public.User.create({
    email: 'mate1@test.com',
    password: await bcrypt.hash('password123', 4),
    name: 'Mate One',
    role: 'mate',
  });

  const mateUser2 = await db.orm.public.User.create({
    email: 'mate2@test.com',
    password: await bcrypt.hash('password123', 4),
    name: 'Mate Two',
    role: 'mate',
  });

  const admin = await db.orm.public.User.create({
    email: 'admin@test.com',
    password: await bcrypt.hash('password123', 4),
    name: 'Admin',
    role: 'admin',
  });

  // Query activities from seeded data
  const activity1 = await db.orm.public.Activity.where({
    name: 'เดินเล่น',
  }).first();
  if (!activity1) {
    throw new Error(
      'Activity "เดินเล่น" not found in database. Make sure seed.ts has run.',
    );
  }

  const activity2 = await db.orm.public.Activity.where({
    name: 'ดูหนัง',
  }).first();
  if (!activity2) {
    throw new Error(
      'Activity "ดูหนัง" not found in database. Make sure seed.ts has run.',
    );
  }

  const interest1 = await db.orm.public.Interest.where({
    name: 'ท่องเที่ยว',
  }).first();
  if (!interest1) {
    throw new Error(
      'Interest "ท่องเที่ยว" not found in database. Make sure seed.ts has run.',
    );
  }

  // Get first province and district for testing
  const province = await db.orm.public.Province.where((p) =>
    p.id.gt(0),
  ).first();
  if (!province) {
    throw new Error(
      'No provinces found in database. Make sure seed.ts has run.',
    );
  }

  const district = await db.orm.public.District.where({
    provinceId: province.id,
  }).first();
  if (!district) {
    throw new Error(
      `No districts found for province ${province.id}. Make sure seed.ts has run.`,
    );
  }

  // Create mate profiles
  const mate1 = await db.orm.public.Mate.create({
    userId: mateUser1.id,
    hourlyRate: '500.00',
    isActive: true,
    bio: 'Experienced mover',
    provinceId: province.id,
    districtId: district.id,
  });

  const mate2 = await db.orm.public.Mate.create({
    userId: mateUser2.id,
    hourlyRate: '600.00',
    isActive: true,
    bio: 'Experienced cleaner',
    provinceId: province.id,
    districtId: district.id,
  });

  // Link mate activities
  await db.orm.public.MateActivity.create({
    mateId: mate1.id,
    activityId: activity1.id,
  });

  await db.orm.public.MateInterest.create({
    mateId: mate1.id,
    interestId: interest1.id,
  });

  await db.orm.public.MateActivity.create({
    mateId: mate2.id,
    activityId: activity2.id,
  });

  // Set availability for mate1 (09:00-18:00 every day)
  const daysOfWeek = [1, 2, 3, 4, 5, 6, 7];
  for (const day of daysOfWeek) {
    await db.orm.public.MateAvailability.create({
      mateId: mate1.id,
      dayOfWeek: day,
      startTime: '09:00',
      endTime: '18:00',
    });
  }

  // Set availability for mate2 (10:00-17:00 every day)
  for (const day of daysOfWeek) {
    await db.orm.public.MateAvailability.create({
      mateId: mate2.id,
      dayOfWeek: day,
      startTime: '10:00',
      endTime: '17:00',
    });
  }

  return {
    renter1,
    renter2,
    mateUser1,
    mateUser2,
    admin,
    mate1,
    mate2,
    activity1,
    activity2,
    interest1,
    province,
    district,
  };
}

/**
 * Clean up all test-created data from database.
 *
 * NOTE: Activity and Interest are NOT deleted here — they are permanent
 * reference/lookup data seeded once via `npm run seed` (prisma/seed.ts).
 * seedTestDatabase() only *queries* them (never creates them), so deleting
 * them here would break every subsequent call to seedTestDatabase().
 *
 * Call this in beforeAll (before seeding) or afterAll (after tests) hook.
 */
export async function cleanupTestDatabase(): Promise<void> {
  // IMPORTANT: `.delete()` only removes a single (the first) matching row.
  // To remove *every* matching row we must use `.deleteAndCount()` instead.
  //
  // Children must be deleted before their parents to satisfy FK constraints:
  // RefreshToken/Notification/Booking -> User, Payment/Review -> Booking,
  // MateActivity/MateInterest/MateAvailability -> Mate.
  await db.orm.public.RefreshToken.where((rt) =>
    rt.userId.gt(0),
  ).deleteAndCount();
  for (const event of await db.orm.public.StripeWebhookEvent.all()) {
    await db.orm.public.StripeWebhookEvent.where({ id: event.id }).delete();
  }
  await db.orm.public.Payment.where((p) => p.id.gt(0)).deleteAndCount();
  await db.orm.public.Review.where((r) => r.id.gt(0)).deleteAndCount();
  await db.orm.public.Report.where((r) => r.id.gt(0)).deleteAndCount();
  await db.orm.public.Notification.where((n) => n.id.gt(0)).deleteAndCount();
  await db.orm.public.Message.where((m) => m.id.gt(0)).deleteAndCount();

  await db.orm.public.Booking.where((b) => b.id.gt(0)).deleteAndCount();

  await Promise.all([
    db.orm.public.MateAvailability.where((ma) => ma.id.gt(0)).deleteAndCount(),
    db.orm.public.MateActivity.where((ma) => ma.mateId.gt(0)).deleteAndCount(),
    db.orm.public.MateInterest.where((mi) => mi.mateId.gt(0)).deleteAndCount(),
    db.orm.public.MatePhoto.where((photo) => photo.id.gt(0)).deleteAndCount(),
  ]);

  await db.orm.public.Mate.where((m) => m.id.gt(0)).deleteAndCount();
  await db.orm.public.User.where((u) => u.id.gt(0)).deleteAndCount();
}

/**
 * Get a future date string in YYYY-MM-DD format (N days from now).
 * Useful for creating bookings that must be in the future.
 */
export function getFutureDate(daysFromNow: number = 1): string {
  const today = Temporal.PlainDate.from(
    Temporal.Now.zonedDateTimeISO(TIMEZONE).toPlainDate(),
  );
  const future = today.add({ days: daysFromNow });
  return future.toString();
}

/**
 * Helper to verify notification was sent to a user.
 * Call after an action (booking create, accept, etc).
 */
export async function getNotificationsForUser(
  userId: number,
): Promise<NotificationRecord[]> {
  const notifications = await db.orm.public.Notification.where({
    userId,
  }).all();
  return notifications;
}

/**
 * Helper to find a notification by type and bookingId.
 */
export function findNotification(
  notifications: NotificationRecord[],
  type: string,
  bookingId?: number,
): NotificationRecord | undefined {
  return notifications.find(
    (n) => n.type === type && (bookingId ? n.bookingId === bookingId : true),
  );
}
