import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminService } from './admin.service.js';
import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  clearModerationRecords,
  getBanRecord,
  isUserActive,
  isUserBanned,
  isUserVerified,
} from './ban.store.js';

// Mock the db module — vi.mock is hoisted, so import Temporal inside the factory
vi.mock('../prisma/db.js', async () => {
  const { Temporal } = await import('@js-temporal/polyfill');
  const now = Temporal.Now.instant();
  const yesterday = now.subtract({ hours: 24 });

  const mockUsers = [
    { id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin', password: 'hash', createdAt: now, updatedAt: now },
    { id: 2, name: 'John Renter', email: 'john@test.com', role: 'renter', password: 'hash', createdAt: yesterday, updatedAt: yesterday },
    { id: 3, name: 'Jane Mate', email: 'jane@test.com', role: 'mate', password: 'hash', createdAt: yesterday, updatedAt: yesterday },
  ];

  const mockMates = [
    { id: 10, userId: 3, age: 25, bio: 'Mate bio', provinceId: 1, districtId: 1, hourlyRate: 350, isActive: true },
  ];

  const mockActivities = [
    { id: 5, name: 'Dining' },
  ];

  const mockBookings = [
    {
      id: 101,
      renterId: 2,
      mateId: 10,
      activityId: 5,
      date: '2026-09-15',
      startTime: '10:00',
      endTime: '12:00',
      totalPrice: '700',
      status: 'confirmed',
      createdAt: yesterday,
      updatedAt: yesterday,
    },
  ];

  const mockPayments: Array<Record<string, unknown>> = [];

  const createQueryMock = (items: Array<any>) => {
    const q: any = {
      all: vi.fn(() => Promise.resolve([...items])),
      first: vi.fn(() => Promise.resolve(items[0] ?? null)),
      where: vi.fn((filter: any) => {
        let filtered = items;
        if (typeof filter === 'function') {
          const dummyArg: any = {
            id: { in: (ids: any[]) => ({ type: 'in', ids }) },
            createdAt: {
              gte: () => ({}),
              lt: () => ({}),
            },
            paidAt: {
              gte: () => ({}),
              lt: () => ({}),
            },
            name: {
              ilike: () => ({}),
            },
          };
          const expr = filter(dummyArg);
          if (expr?.type === 'in') {
            filtered = items.filter((item) => expr.ids.includes(item.id));
          }
        } else if (typeof filter === 'object' && filter !== null) {
          filtered = items.filter((item) =>
            Object.entries(filter).every(([k, v]) => item[k] === v),
          );
        }
        return createQueryMock(filtered);
      }),
      orderBy: vi.fn(() => createQueryMock(items)),
      limit: vi.fn((lim: number) => ({
        offset: vi.fn((off: number) => createQueryMock(items.slice(off, off + lim))),
      })),
    };
    return q;
  };

  return {
    db: {
      orm: {
        public: {
          User: {
            all: vi.fn(() => Promise.resolve([...mockUsers])),
            where: vi.fn((filter: any) => {
              if (typeof filter === 'object' && filter !== null && 'id' in filter) {
                return {
                  first: vi.fn(() => Promise.resolve(mockUsers.find((u) => u.id === filter.id) ?? null)),
                };
              }
              return createQueryMock(mockUsers).where(filter);
            }),
          },
          Booking: {
            all: vi.fn(() => Promise.resolve([...mockBookings])),
            where: vi.fn((filter: any) => createQueryMock(mockBookings).where(filter)),
          },
          Payment: {
            all: vi.fn(() => Promise.resolve([...mockPayments])),
            where: vi.fn((filter: any) => createQueryMock(mockPayments).where(filter)),
          },
          Mate: {
            all: vi.fn(() => Promise.resolve([...mockMates])),
            where: vi.fn((filter: any) => {
              if (typeof filter === 'object' && filter !== null && 'userId' in filter) {
                return {
                  first: vi.fn(() => Promise.resolve(mockMates.find((m) => m.userId === filter.userId) ?? null)),
                  update: vi.fn(() => Promise.resolve(null)),
                };
              }
              return createQueryMock(mockMates).where(filter);
            }),
          },
          Activity: {
            all: vi.fn(() => Promise.resolve([...mockActivities])),
            where: vi.fn((filter: any) => createQueryMock(mockActivities).where(filter)),
          },
          RefreshToken: {
            where: vi.fn(() => ({
              update: vi.fn(() => Promise.resolve(null)),
            })),
          },
        },
      },
    },
  };
});

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(() => {
    clearModerationRecords();
    service = new AdminService();
  });

  describe('listUsers', () => {
    it('should return all users with default pagination and default moderation flags', async () => {
      const result = await service.listUsers({});
      expect(result.items).toHaveLength(3);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
      expect(result.meta.total).toBe(3);
      expect(result.items[0]).toHaveProperty('isBanned', false);
      expect(result.items[0]).toHaveProperty('isActive', true);
      expect(result.items[0]).toHaveProperty('isVerified', false);
    });

    it('should filter users by role', async () => {
      const result = await service.listUsers({ role: 'mate' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].role).toBe('mate');
    });

    it('should apply pagination', async () => {
      const result = await service.listUsers({ page: 1, limit: 2 });
      expect(result.items).toHaveLength(2);
      expect(result.meta.totalPages).toBe(2);
    });

    it('should not expose password in returned users', async () => {
      const result = await service.listUsers({});
      for (const user of result.items) {
        expect(user).not.toHaveProperty('password');
      }
    });
  });

  describe('banUser', () => {
    it('should throw ForbiddenException when banning self', async () => {
      await expect(service.banUser(1, 1, 'reason')).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for non-existent user', async () => {
      await expect(service.banUser(1, 999, 'reason')).rejects.toThrow(NotFoundException);
    });

    it('should return safe user on successful ban and record in BanStore', async () => {
      const result = await service.banUser(1, 2, 'Terms of service violation');
      expect(result.id).toBe(2);
      expect(result.isBanned).toBe(true);
      expect(result).not.toHaveProperty('password');

      expect(isUserBanned(2)).toBe(true);
      const record = getBanRecord(2);
      expect(record?.reason).toBe('Terms of service violation');
      expect(record?.bannedBy).toBe(1);
    });
  });

  describe('unbanUser', () => {
    it('should throw NotFoundException for non-existent user', async () => {
      await expect(service.unbanUser(999)).rejects.toThrow(NotFoundException);
    });

    it('should return safe user and remove from BanStore', async () => {
      await service.banUser(1, 2, 'Violation');
      expect(isUserBanned(2)).toBe(true);

      const result = await service.unbanUser(2);
      expect(result.id).toBe(2);
      expect(result.isBanned).toBe(false);
      expect(isUserBanned(2)).toBe(false);
    });
  });

  describe('verifyUser', () => {
    it('should throw NotFoundException for non-existent user', async () => {
      await expect(service.verifyUser(999)).rejects.toThrow(NotFoundException);
    });

    it('should throw UnprocessableEntityException for non-mate user', async () => {
      await expect(service.verifyUser(2)).rejects.toThrow(UnprocessableEntityException);
    });

    it('should return safe user with isVerified: true for mate', async () => {
      const result = await service.verifyUser(3);
      expect(result.id).toBe(3);
      expect(result.role).toBe('mate');
      expect(result.isVerified).toBe(true);
      expect(isUserVerified(3)).toBe(true);
    });
  });

  describe('activateUser', () => {
    it('should throw NotFoundException for non-existent user', async () => {
      await expect(service.activateUser(999)).rejects.toThrow(NotFoundException);
    });

    it('should return safe user with isActive: true', async () => {
      const result = await service.activateUser(3);
      expect(result.id).toBe(3);
      expect(result.isActive).toBe(true);
      expect(isUserActive(3)).toBe(true);
    });
  });

  describe('listBookings', () => {
    it('should return paginated bookings with correct mate and renter names avoiding N+1', async () => {
      const result = await service.listBookings({});
      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      const booking = result.items[0];
      expect(booking.renter.name).toBe('John Renter');
      // Verify mate.name correctly maps mate.userId to 'Jane Mate' even though mate.id is 10
      expect(booking.mate.name).toBe('Jane Mate');
      expect(booking.activity.name).toBe('Dining');
    });
  });

  describe('getAnalytics', () => {
    it('should return analytics with default 30-day inclusive range in Asia/Bangkok', async () => {
      const result = await service.getAnalytics({});
      expect(result.range).toBeDefined();
      expect(result.bookingCounts).toBeDefined();
      expect(result.paidRevenue).toBe(0);
      expect(result.newActiveUsers).toBe(3);
      expect(result.daily).toBeDefined();
      // 29-day subtraction creates exactly 30 daily buckets for inclusive date range
      expect(result.daily.length).toBe(30);
    });

    it('should reject when from is after to', async () => {
      await expect(
        service.getAnalytics({ from: '2026-09-15', to: '2026-09-01' }),
      ).rejects.toThrow('from must not be after to');
    });

    it('should reject when range produces 365 or more daysDiff', async () => {
      await expect(
        service.getAnalytics({ from: '2025-01-01', to: '2026-09-13' }),
      ).rejects.toThrow('Date range must not exceed 365 days');
    });

    it('should reject invalid calendar date like 2026-02-30', async () => {
      await expect(
        service.getAnalytics({ from: '2026-02-30', to: '2026-03-05' }),
      ).rejects.toThrow('from must be a valid calendar date in YYYY-MM-DD format');
    });
  });
});
