import { db } from '../../src/prisma/db.js';
import bcrypt from 'bcrypt';
import { Temporal } from '@js-temporal/polyfill';

export interface TestData {
  renter1: any;
  renter2: any;
  mateUser1: any;
  mateUser2: any;
  admin: any;
  mate1: any;
  mate2: any;
  activity1: any;
  activity2: any;
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
    description: 'Help with moving boxes and furniture',
  });

  const activity2 = await db.orm.public.Activity.create({
    name: 'Cleaning',
    description: 'Help with house cleaning',
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
  await db.orm.public.MateActivity.create({
    mateId: mate1.id,
    activityId: activity1.id,
  });

  await db.orm.public.MateActivity.create({
    mateId: mate2.id,
    activityId: activity2.id,
  });

  // Set availability for mate1 (09:00-18:00 every day)
  const daysOfWeek = [0, 1, 2, 3, 4, 5, 6];
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
  };
}

/**
 * Clean up all test data from database.
 * Call this in afterEach or afterAll hook.
 */
export async function cleanupTestDatabase(): Promise<void> {
  await Promise.all([
    db.orm.public.Booking.where((b) => b.id.gt(0)).delete(),
    db.orm.public.Notification.where((n) => n.id.gt(0)).delete(),
    db.orm.public.MateAvailability.where((ma) => ma.id.gt(0)).delete(),
    db.orm.public.MateActivity.where((ma) => ma.id.gt(0)).delete(),
    db.orm.public.Mate.where((m) => m.id.gt(0)).delete(),
    db.orm.public.Activity.where((a) => a.id.gt(0)).delete(),
    db.orm.public.User.where((u) => u.id.gt(0)).delete(),
  ]);
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
export async function getNotificationsForUser(userId: number): Promise<any[]> {
  const notifications = await db.orm.public.Notification.where({
    userId,
  }).all();
  return notifications;
}

/**
 * Helper to find a notification by type and bookingId.
 */
export function findNotification(
  notifications: any[],
  type: string,
  bookingId?: number,
): any {
  return notifications.find(
    (n) => n.type === type && (bookingId ? n.bookingId === bookingId : true),
  );
}
