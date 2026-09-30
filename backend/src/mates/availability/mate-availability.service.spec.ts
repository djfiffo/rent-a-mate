import 'reflect-metadata';
import { Temporal } from '@js-temporal/polyfill';
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
          MateAvailabilityDateOverride: {
            where: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(null),
            }),
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

  it('uses date-specific hours instead of weekly hours, including closed dates', async () => {
    const override = {
      id: 4,
      mateId: 11,
      date: '2099-01-10',
      createdAt: null,
      updatedAt: null,
    };
    const weekly = [
      {
        id: 1,
        mateId: 11,
        dayOfWeek: 7,
        startTime: '09:00',
        endTime: '18:00',
        createdAt: null,
        updatedAt: null,
      },
    ];

    for (const slots of [
      [
        {
          id: 8,
          overrideId: 4,
          startTime: '13:00',
          endTime: '16:00',
          createdAt: null,
          updatedAt: null,
        },
      ],
      [],
    ]) {
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
            MateAvailabilityDateOverride: {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(override),
              }),
            },
            MateAvailabilityDateOverrideSlot: {
              where: vi
                .fn()
                .mockReturnValue({ all: vi.fn().mockResolvedValue(slots) }),
            },
            Booking: {
              where: vi
                .fn()
                .mockReturnValue({ all: vi.fn().mockResolvedValue([]) }),
            },
          },
        },
      } as never;
      const service = new MateAvailabilityService(database);

      await expect(
        service.getPublicAvailability(11, '2099-01-10'),
      ).resolves.toEqual(
        slots.length ? [{ startTime: '13:00', endTime: '16:00' }] : [],
      );
    }
  });

  it('validates bookings against date-specific hours', async () => {
    const database = {
      orm: {
        public: {
          MateAvailability: {
            where: vi.fn().mockReturnValue({
              all: vi
                .fn()
                .mockResolvedValue([
                  { dayOfWeek: 6, startTime: '09:00', endTime: '18:00' },
                ]),
            }),
          },
          MateAvailabilityDateOverride: {
            where: vi.fn().mockReturnValue({
              first: vi
                .fn()
                .mockResolvedValue({ id: 4, mateId: 11, date: '2099-01-10' }),
            }),
          },
          MateAvailabilityDateOverrideSlot: {
            where: vi.fn().mockReturnValue({
              all: vi.fn().mockResolvedValue([
                {
                  id: 8,
                  overrideId: 4,
                  startTime: '13:00',
                  endTime: '16:00',
                },
              ]),
            }),
          },
        },
      },
    } as never;
    const service = new MateAvailabilityService(database);
    const date = Temporal.PlainDate.from('2099-01-10');

    await expect(
      service.isWithinAvailability(11, date, '13:00', '15:00'),
    ).resolves.toBe(true);
    await expect(
      service.isWithinAvailability(11, date, '09:00', '11:00'),
    ).resolves.toBe(false);
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

  it('saves date hours transactionally and preserves an empty closed-date override', async () => {
    let savedOverride: {
      id: number;
      mateId: number;
      date: string;
      createdAt: null;
      updatedAt: null;
    } | null = null;
    let savedSlots: {
      id: number;
      overrideId: number;
      startTime: string;
      endTime: string;
      createdAt: null;
      updatedAt: null;
    }[] = [];
    const overrideModel = {
      where: vi.fn(() => ({ first: vi.fn(async () => savedOverride) })),
      create: vi.fn(
        async ({ mateId, date }: { mateId: number; date: string }) => {
          savedOverride = {
            id: 4,
            mateId,
            date,
            createdAt: null,
            updatedAt: null,
          };
          return savedOverride;
        },
      ),
    };
    const slotModel = {
      where: vi.fn(() => ({
        all: vi.fn(async () => savedSlots),
        deleteAndCount: vi.fn(async () => {
          const count = savedSlots.length;
          savedSlots = [];
          return count;
        }),
      })),
      create: vi.fn(
        async ({
          overrideId,
          startTime,
          endTime,
        }: {
          overrideId: number;
          startTime: string;
          endTime: string;
        }) => {
          const slot = {
            id: savedSlots.length + 1,
            overrideId,
            startTime,
            endTime,
            createdAt: null,
            updatedAt: null,
          };
          savedSlots.push(slot);
          return slot;
        },
      ),
    };
    const database = {
      transaction: vi.fn(async (callback: (transaction: unknown) => unknown) =>
        callback(database),
      ),
      orm: {
        public: {
          Mate: {
            where: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(activeMate),
            }),
          },
          MateAvailabilityDateOverride: overrideModel,
          MateAvailabilityDateOverrideSlot: slotModel,
        },
      },
    } as never;
    const service = new MateAvailabilityService(database);

    await expect(
      service.replaceDateOverride(7, '2099-01-10', {
        slots: [{ startTime: '13:00', endTime: '16:00' }],
      }),
    ).resolves.toEqual({
      date: '2099-01-10',
      slots: [{ startTime: '13:00', endTime: '16:00' }],
    });
    await expect(
      service.replaceDateOverride(7, '2099-01-10', { slots: [] }),
    ).resolves.toEqual({ date: '2099-01-10', slots: [] });
    await expect(
      service.replaceDateOverride(7, '2000-01-01', { slots: [] }),
    ).rejects.toMatchObject({ status: 422 });
    expect(database.transaction).toHaveBeenCalledTimes(2);
    expect(overrideModel.create).toHaveBeenCalledTimes(1);
    expect(slotModel.create).toHaveBeenCalledTimes(1);
  });
});
