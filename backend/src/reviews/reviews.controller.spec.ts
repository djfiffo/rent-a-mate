import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  BookingReviewController,
  ReviewsController,
} from './reviews.controller.js';

describe('BookingReviewController', () => {
  const renter = { id: 7, role: 'renter' as const };

  it('wraps create() in the success envelope', async () => {
    const detail = {
      id: 1,
      bookingId: 1,
      renterId: 7,
      mateId: 3,
      rating: 5,
      comment: null,
    };
    const service = { create: vi.fn().mockResolvedValue(detail) };
    const controller = new BookingReviewController(service as never);

    await expect(controller.create(renter, 1, { rating: 5 })).resolves.toEqual({
      status: 'success',
      message: 'Review created',
      data: detail,
    });
    expect(service.create).toHaveBeenCalledWith(renter, 1, { rating: 5 });
  });

  it('rejects create() for an unauthenticated caller before calling the service', async () => {
    const service = { create: vi.fn() };
    const controller = new BookingReviewController(service as never);

    await expect(
      controller.create(undefined, 1, { rating: 5 }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.create).not.toHaveBeenCalled();
  });
});

describe('ReviewsController', () => {
  const renter = { id: 7, role: 'renter' as const };

  it('wraps update() in the success envelope', async () => {
    const detail = {
      id: 1,
      bookingId: 1,
      renterId: 7,
      mateId: 3,
      rating: 4,
      comment: 'Updated',
    };
    const service = { update: vi.fn().mockResolvedValue(detail) };
    const controller = new ReviewsController(service as never);

    await expect(controller.update(renter, 1, { rating: 4 })).resolves.toEqual({
      status: 'success',
      message: 'Review updated',
      data: detail,
    });
    expect(service.update).toHaveBeenCalledWith(renter, 1, { rating: 4 });
  });

  it('rejects update() for an unauthenticated caller before calling the service', async () => {
    const service = { update: vi.fn() };
    const controller = new ReviewsController(service as never);

    await expect(
      controller.update(undefined, 1, { rating: 4 }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.update).not.toHaveBeenCalled();
  });

  it('wraps remove() in the success envelope', async () => {
    const service = { remove: vi.fn().mockResolvedValue(undefined) };
    const controller = new ReviewsController(service as never);

    await expect(controller.remove(renter, 1)).resolves.toEqual({
      status: 'success',
      message: 'Review removed',
      data: null,
    });
    expect(service.remove).toHaveBeenCalledWith(renter, 1);
  });

  it('rejects remove() for an unauthenticated caller before calling the service', async () => {
    const service = { remove: vi.fn() };
    const controller = new ReviewsController(service as never);

    await expect(controller.remove(undefined, 1)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(service.remove).not.toHaveBeenCalled();
  });
});
