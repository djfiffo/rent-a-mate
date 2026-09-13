import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminService } from './admin.service.js';
import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';

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

  const mockBookings: Array<Record<string, unknown>> = [];
  const mockPayments: Array<Record<string, unknown>> = [];

  return {
    db: {
      orm: {
        public: {
          User: {
            all: vi.fn(() => Promise.resolve([...mockUsers])),
            where: vi.fn((filter: Record<string, unknown>) => ({
              first: vi.fn(() => Promise.resolve(mockUsers.find((u) => u.id === filter.id) ?? null)),
            })),
          },
          Booking: {
            all: vi.fn(() => Promise.resolve([...mockBookings])),
          },
          Payment: {
            all: vi.fn(() => Promise.resolve([...mockPayments])),
          },
          Mate: {
            where: vi.fn(() => ({
              first: vi.fn(() => Promise.resolve(null)),
            })),
          },
          Activity: {
            where: vi.fn(() => ({
              first: vi.fn(() => Promise.resolve(null)),
            })),
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
    service = new AdminService();
  });

  describe('listUsers', () => {
    it('should return all users with default pagination', async () => {
      const result = await service.listUsers({});
      expect(result.items).toHaveLength(3);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
      expect(result.meta.total).toBe(3);
    });

    it('should filter users by search query', async () => {
      const result = await service.listUsers({ q: 'john' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('John Renter');
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

    it('should return safe user on successful ban', async () => {
      const result = await service.banUser(1, 2, 'Violation');
      expect(result.id).toBe(2);
      expect(result).not.toHaveProperty('password');
    });
  });

  describe('unbanUser', () => {
    it('should throw NotFoundException for non-existent user', async () => {
      await expect(service.unbanUser(999)).rejects.toThrow(NotFoundException);
    });

    it('should return safe user', async () => {
      const result = await service.unbanUser(2);
      expect(result.id).toBe(2);
    });
  });

  describe('verifyUser', () => {
    it('should throw NotFoundException for non-existent user', async () => {
      await expect(service.verifyUser(999)).rejects.toThrow(NotFoundException);
    });

    it('should throw UnprocessableEntityException for non-mate user', async () => {
      await expect(service.verifyUser(2)).rejects.toThrow(UnprocessableEntityException);
    });

    it('should return safe user for mate', async () => {
      const result = await service.verifyUser(3);
      expect(result.id).toBe(3);
      expect(result.role).toBe('mate');
    });
  });

  describe('activateUser', () => {
    it('should throw NotFoundException for non-existent user', async () => {
      await expect(service.activateUser(999)).rejects.toThrow(NotFoundException);
    });

    it('should return safe user', async () => {
      const result = await service.activateUser(2);
      expect(result.id).toBe(2);
    });
  });

  describe('listBookings', () => {
    it('should return empty list with default pagination', async () => {
      const result = await service.listBookings({});
      expect(result.items).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });
  });

  describe('getAnalytics', () => {
    it('should return analytics with default 30-day range', async () => {
      const result = await service.getAnalytics({});
      expect(result.range).toBeDefined();
      expect(result.bookingCounts).toBeDefined();
      expect(result.paidRevenue).toBe(0);
      expect(result.newActiveUsers).toBeGreaterThanOrEqual(0);
      expect(result.daily).toBeDefined();
    });

    it('should reject when from is after to', async () => {
      await expect(
        service.getAnalytics({ from: '2026-09-15', to: '2026-09-01' }),
      ).rejects.toThrow('from must not be after to');
    });

    it('should reject when range exceeds 365 days', async () => {
      await expect(
        service.getAnalytics({ from: '2025-01-01', to: '2026-09-13' }),
      ).rejects.toThrow('Date range must not exceed 365 days');
    });
  });
});
