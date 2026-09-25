import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  BookingPaymentsController,
  PaymentsController,
} from './payments.controller.js';

describe('BookingPaymentsController', () => {
  const renter = { id: 7, role: 'renter' as const };

  it('wraps pay() in the success envelope', async () => {
    const result = {
      bookingId: 1,
      status: 'pending' as const,
      clientSecret: 'secret_123',
    };
    const service = { pay: vi.fn().mockResolvedValue(result) };
    const controller = new BookingPaymentsController(service as never);

    await expect(controller.pay(renter, 1)).resolves.toEqual({
      status: 'success',
      message: 'Payment intent created',
      data: result,
    });
    expect(service.pay).toHaveBeenCalledWith(renter, 1);
  });

  it('rejects pay() for an unauthenticated caller before calling the service', async () => {
    const service = { pay: vi.fn() };
    const controller = new BookingPaymentsController(service as never);

    await expect(controller.pay(undefined, 1)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(service.pay).not.toHaveBeenCalled();
  });

  it('wraps getStatus() in the success envelope', async () => {
    const detail = {
      bookingId: 1,
      amount: '400.00',
      status: 'pending' as const,
    };
    const service = { getStatus: vi.fn().mockResolvedValue(detail) };
    const controller = new BookingPaymentsController(service as never);

    await expect(controller.getStatus(renter, 1)).resolves.toEqual({
      status: 'success',
      message: 'OK',
      data: detail,
    });
    expect(service.getStatus).toHaveBeenCalledWith(renter, 1);
  });

  it('wraps refund() in the success envelope and does not require CurrentUser', async () => {
    const detail = {
      bookingId: 1,
      amount: '400.00',
      status: 'refunding' as const,
    };
    const service = { refundAsAdmin: vi.fn().mockResolvedValue(detail) };
    const controller = new BookingPaymentsController(service as never);

    await expect(controller.refund(1)).resolves.toEqual({
      status: 'success',
      message: 'Refund initiated',
      data: detail,
    });
    expect(service.refundAsAdmin).toHaveBeenCalledWith(1);
  });

  it('propagates a service-level error (e.g. REFUND_NOT_ALLOWED) unchanged', async () => {
    const service = {
      refundAsAdmin: vi.fn().mockRejectedValue(new ForbiddenException('nope')),
    };
    const controller = new BookingPaymentsController(service as never);

    await expect(controller.refund(1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('PaymentsController', () => {
  const renter = { id: 7, role: 'renter' as const };

  it('wraps listMine() in the success envelope', async () => {
    const paginated = {
      items: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    };
    const service = { listMine: vi.fn().mockResolvedValue(paginated) };
    const controller = new PaymentsController(service as never);

    await expect(controller.listMine(renter, {})).resolves.toEqual({
      status: 'success',
      message: 'OK',
      data: paginated,
    });
    expect(service.listMine).toHaveBeenCalledWith(renter, {});
  });

  it('rejects listMine() for an unauthenticated caller before calling the service', async () => {
    const service = { listMine: vi.fn() };
    const controller = new PaymentsController(service as never);

    await expect(controller.listMine(undefined, {})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(service.listMine).not.toHaveBeenCalled();
  });
});
