import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { RolesGuard } from './roles.guard.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

describe('AdminController', () => {
  let controller: AdminController;
  let service: AdminService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: {
            listUsers: vi.fn(),
            banUser: vi.fn(),
            unbanUser: vi.fn(),
            activateUser: vi.fn(),
            verifyUser: vi.fn(),
            listBookings: vi.fn(),
            getAnalytics: vi.fn(),
          },
        },
        RolesGuard,
        Reflector,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AdminController);
    service = module.get(AdminService);
  });

  describe('RolesGuard enforcement', () => {
    let rolesGuard: RolesGuard;
    let reflector: Reflector;

    beforeEach(() => {
      reflector = new Reflector();
      rolesGuard = new RolesGuard(reflector);
    });

    it('should permit user with admin role', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
      const context = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({ user: { id: 1, role: 'admin' } }),
        }),
      } as unknown as ExecutionContext;

      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('should reject user with non-admin role (e.g. renter)', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
      const context = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({ user: { id: 2, role: 'renter' } }),
        }),
      } as unknown as ExecutionContext;

      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should reject unauthenticated request without role', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
      const context = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({ user: undefined }),
        }),
      } as unknown as ExecutionContext;

      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });

  });

  describe('listUsers', () => {
    it('should return paginated users', async () => {
      const result = {
        items: [{ id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin', createdAt: null, updatedAt: null }],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      };
      vi.spyOn(service, 'listUsers').mockResolvedValue(result);

      const response = await controller.listUsers({});
      expect(response.status).toBe('success');
      expect(response.data.items).toHaveLength(1);
      expect(response.data.meta.total).toBe(1);
    });
  });

  describe('banUser', () => {
    it('should ban a user and return success envelope', async () => {
      const user = { id: 2, name: 'Test', email: 'test@test.com', role: 'renter', createdAt: null, updatedAt: null };
      vi.spyOn(service, 'banUser').mockResolvedValue(user);

      const response = await controller.banUser(
        { id: 1, role: 'admin' },
        2,
        { reason: 'Violation' },
      );
      expect(response.status).toBe('success');
      expect(response.message).toBe('User banned');
      expect(response.data.user.id).toBe(2);
    });

    it('should throw UnauthorizedException when admin identity is missing', async () => {
      await expect(controller.banUser(undefined, 2, { reason: 'Violation' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('unbanUser', () => {
    it('should return success envelope', async () => {
      const user = { id: 2, name: 'Test', email: 'test@test.com', role: 'renter', createdAt: null, updatedAt: null };
      vi.spyOn(service, 'unbanUser').mockResolvedValue(user);

      const response = await controller.unbanUser(2);
      expect(response.status).toBe('success');
      expect(response.message).toBe('User unbanned');
    });
  });

  describe('verifyUser', () => {
    it('should return success envelope', async () => {
      const user = { id: 2, name: 'Mate', email: 'mate@test.com', role: 'mate', createdAt: null, updatedAt: null };
      vi.spyOn(service, 'verifyUser').mockResolvedValue(user);

      const response = await controller.verifyUser(2);
      expect(response.status).toBe('success');
      expect(response.message).toBe('User verified');
    });
  });

  describe('activateUser', () => {
    it('should return success envelope', async () => {
      const user = { id: 2, name: 'Test', email: 'test@test.com', role: 'renter', createdAt: null, updatedAt: null };
      vi.spyOn(service, 'activateUser').mockResolvedValue(user);

      const response = await controller.activateUser(2);
      expect(response.status).toBe('success');
      expect(response.message).toBe('User activated');
    });
  });

  describe('listBookings', () => {
    it('should return paginated bookings', async () => {
      const result = {
        items: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      };
      vi.spyOn(service, 'listBookings').mockResolvedValue(result);

      const response = await controller.listBookings({});
      expect(response.status).toBe('success');
      expect(response.data.items).toHaveLength(0);
    });
  });

  describe('getAnalytics', () => {
    it('should return analytics data', async () => {
      const result = {
        range: { from: '2026-08-14', to: '2026-09-13' },
        bookingCounts: { pending: 0, confirmed: 0, completed: 0, cancelled: 0 },
        paidRevenue: 0,
        newActiveUsers: 0,
        daily: [],
      };
      vi.spyOn(service, 'getAnalytics').mockResolvedValue(result);

      const response = await controller.getAnalytics({});
      expect(response.status).toBe('success');
      expect(response.data.range).toBeDefined();
      expect(response.data.bookingCounts).toBeDefined();
    });
  });
});
