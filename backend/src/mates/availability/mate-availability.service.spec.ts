import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { MateAvailabilityService } from './mate-availability.service.js';

const activeMate = { id: 11, userId: 7, isActive: true };

describe('MateAvailabilityService', () => {
  it('subtracts a pending booking and splits a weekly window', async () => {
    const weekly = [
      {
        id: 1,
        mateId: 11,
        dayOfWeek: 6,
        startTime: '10:00',
        endTime: '18:00',
        createdAt: null,
        updatedAt: null,
      },
    ];
    const booking = {
      id: 3,
      mateId: 11,
      date: new Date('2099-01-09T17:00:00.000Z'),
      startTime: new Date('2099-01-10T06:00:00.000Z'),
      endTime: new Date('2099-01-10T08:00:00.000Z'),
      status: 'pending',
    };
    const database = {
      orm: {
        public: {
          Mate: {
            where: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(activeMate),
            }),
          },
          User: {
            where: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({
                id: 7,
                isActive: true,
                isBanned: false,
              }),
            }),
          },
          MateAvailability: {
            where: vi
              .fn()
              .mockReturnValue({ all: vi.fn().mockResolvedValue(weekly) }),
          },
          Booking: {
            where: vi
              .fn()
              .mockReturnValue({ all: vi.fn().mockResolvedValue([booking]) }),
          },
        },
      },
    } as never;
    const service = new MateAvailabilityService(database);

    await expect(
      service.getPublicAvailability(11, '2099-01-10'),
    ).resolves.toEqual([
      { startTime: '10:00', endTime: '13:00' },
      { startTime: '15:00', endTime: '18:00' },
    ]);
  });

  it('replaces the full schedule transactionally and rejects overlap before deletion', async () => {
    const created: unknown[] = [];
    const deleteAndCount = vi.fn().mockResolvedValue(2);
    const create = vi.fn(async (value: unknown) => {
      created.push(value);
      return value;
    });
    const mateAvailability = {
      where: vi.fn().mockReturnValue({
        deleteAndCount,
        all: vi.fn().mockResolvedValue(created),
      }),
      create,
    };
    const database = {
      transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback(database),
      ),
      orm: {
        public: {
          Mate: {
            where: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(activeMate),
            }),
          },
          User: {
            where: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({
                id: 7,
                isActive: true,
                isBanned: false,
              }),
            }),
          },
          MateAvailability: mateAvailability,
        },
      },
    } as never;
    const service = new MateAvailabilityService(database);

    await service.replace(7, {
      availability: [
        { dayOfWeek: 1, startTime: '09:00', endTime: '12:00' },
        { dayOfWeek: 1, startTime: '13:00', endTime: '17:00' },
      ],
    });
    expect(deleteAndCount).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(2);

    await expect(
      service.replace(7, {
        availability: [
          { dayOfWeek: 1, startTime: '09:00', endTime: '12:00' },
          { dayOfWeek: 1, startTime: '11:00', endTime: '13:00' },
        ],
      }),
    ).rejects.toThrow('overlaps');
    expect(deleteAndCount).toHaveBeenCalledTimes(1);
  });

  it('rejects public availability dates in the past', async () => {
    const database = {
      orm: {
        public: {
          Mate: {
            where: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(activeMate),
            }),
          },
          User: {
            where: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({
                id: 7,
                isActive: true,
                isBanned: false,
              }),
            }),
          },
        },
      },
    } as never;
    const service = new MateAvailabilityService(database);

    await expect(
      service.getPublicAvailability(11, '2000-01-01'),
    ).rejects.toMatchObject({ status: 422 });
  });
});
