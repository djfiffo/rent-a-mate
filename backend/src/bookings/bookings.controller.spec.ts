import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BookingsController } from './bookings.controller.js';

const booking = {
  id: 1,
  renterId: 7,
  mateId: 3,
  activityId: 2,
  date: '2026-09-10T00:00:00.000Z',
  startTime: '2026-09-10T10:00:00.000Z',
  endTime: '2026-09-10T12:00:00.000Z',
  totalPrice: '400.00',
  status: 'pending' as const,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('BookingsController', () => {
  const user = { id: 7, role: 'renter' as const };

  it('wraps create() in the success envelope', async () => {
    const service = {
      create: vi.fn().mockResolvedValue({ id: 1, status: 'pending', totalPrice: '400.00' }),
    };
    const controller = new BookingsController(service as never);

    await expect(
      controller.create(user, { mateId: 3, activityId: 2, date: '2026-09-10', startTime: '10:00', endTime: '12:00' }),
    ).resolves.toEqual({
      status: 'success',
      message: 'Booking request sent',
      data: { id: 1, status: 'pending', totalPrice: '400.00' },
    });
    expect(service.create).toHaveBeenCalledWith(7, expect.objectContaining({ mateId: 3 }));
  });

  it('rejects create() for an unauthenticated caller before calling the service', async () => {
    const service = { create: vi.fn() };
    const controller = new BookingsController(service as never);

    await expect(
      controller.create(undefined, { mateId: 3, activityId: 2, date: '2026-09-10', startTime: '10:00', endTime: '12:00' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('wraps findMine() in the success envelope', async () => {
    const paginated = { items: [booking], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } };
    const service = { findMine: vi.fn().mockResolvedValue(paginated) };
    const controller = new BookingsController(service as never);

    await expect(controller.findMine(user, {})).resolves.toEqual({
      status: 'success',
      message: 'OK',
      data: paginated,
    });
    expect(service.findMine).toHaveBeenCalledWith(user, {});
  });

  it('wraps findOne() in the success envelope', async () => {
    const service = { findOne: vi.fn().mockResolvedValue(booking) };
    const controller = new BookingsController(service as never);

    await expect(controller.findOne(user, 1)).resolves.toEqual({
      status: 'success',
      message: 'OK',
      data: booking,
    });
    expect(service.findOne).toHaveBeenCalledWith(user, 1);
  });

  it('wraps accept(), decline(), cancel(), and complete() in the success envelope', async () => {
    const service = {
      accept: vi.fn().mockResolvedValue({ ...booking, status: 'confirmed' }),
      decline: vi.fn().mockResolvedValue({ ...booking, status: 'cancelled' }),
      cancel: vi.fn().mockResolvedValue({ ...booking, status: 'cancelled' }),
      complete: vi.fn().mockResolvedValue({ ...booking, status: 'completed' }),
    };
    const controller = new BookingsController(service as never);

    await expect(controller.accept(user, 1)).resolves.toMatchObject({
      message: 'Booking confirmed',
      data: { status: 'confirmed' },
    });
    await expect(controller.decline(user, 1)).resolves.toMatchObject({
      message: 'Booking declined',
      data: { status: 'cancelled' },
    });
    await expect(controller.cancel(user, 1)).resolves.toMatchObject({
      message: 'Booking cancelled',
      data: { status: 'cancelled' },
    });
    await expect(controller.complete(user, 1)).resolves.toMatchObject({
      message: 'Booking completed',
      data: { status: 'completed' },
    });

    expect(service.accept).toHaveBeenCalledWith(user, 1);
    expect(service.decline).toHaveBeenCalledWith(user, 1);
    expect(service.cancel).toHaveBeenCalledWith(user, 1);
    expect(service.complete).toHaveBeenCalledWith(user, 1);
  });
});
