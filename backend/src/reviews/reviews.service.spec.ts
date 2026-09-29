import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { ReviewsService } from './reviews.service.js';
import type { ReviewDatabase } from './reviews.types.js';

type Row = Record<string, unknown>;
type Filter = Row | ((proxy: never) => boolean);

function matchesFilter(row: Row, filter: Filter): boolean {
  if (typeof filter === 'function') {
    const proxy = new Proxy(
      {},
      {
        get: (_target, key: string) => ({
          eq: (value: unknown) => row[key] === value,
          in: (values: unknown[]) => values.includes(row[key]),
        }),
      },
    );
    return filter(proxy as never);
  }
  return Object.entries(filter).every(([key, value]) => row[key] === value);
}

function createTable(
  rows: Row[],
  idField: string | null,
  nextId: { value: number },
) {
  const makeQuery = (filters: Filter[]) => ({
    where: (filter: Filter) => makeQuery([...filters, filter]),
    first: async () =>
      rows.find((row) =>
        filters.every((filter) => matchesFilter(row, filter)),
      ) ?? null,
    all: async () =>
      rows.filter((row) =>
        filters.every((filter) => matchesFilter(row, filter)),
      ),
    update: async (data: Row) => {
      const target = rows.find((row) =>
        filters.every((filter) => matchesFilter(row, filter)),
      );
      if (!target) return null;
      Object.assign(target, data);
      return { ...target };
    },
    delete: async () => {
      const index = rows.findIndex((row) =>
        filters.every((filter) => matchesFilter(row, filter)),
      );
      if (index === -1) return null;
      const [removed] = rows.splice(index, 1);
      return removed;
    },
  });

  return {
    where: (filter: Filter) => makeQuery([filter]),
    create: async (data: Row) => {
      const row: Row = { ...data };
      if (idField && row[idField] === undefined) {
        row[idField] = nextId.value++;
      }
      rows.push(row);
      return { ...row };
    },
    rows,
  };
}

function createFixture() {
  const bookingRows: Row[] = [
    { id: 1, renterId: 7, mateId: 3, status: 'completed' },
    { id: 2, renterId: 7, mateId: 3, status: 'confirmed' },
  ];
  const reviewRows: Row[] = [];

  const bookingTable = createTable(bookingRows, 'id', { value: 100 });
  const reviewTable = createTable(reviewRows, 'id', { value: 1 });

  const database: ReviewDatabase = {
    orm: {
      public: {
        Review: reviewTable as never,
        Booking: bookingTable as never,
        Notification: { create: async () => ({}) as never },
      },
    },
    transaction: async (callback) => callback(database),
  };

  const service = new ReviewsService(database);

  return { service, bookingRows, reviewRows };
}

describe('ReviewsService', () => {
  let fixture: ReturnType<typeof createFixture>;
  const renter = { id: 7, role: 'renter' as const };
  const stranger = { id: 99, role: 'renter' as const };
  const admin = { id: 1, role: 'admin' as const };

  beforeEach(() => {
    fixture = createFixture();
  });

  describe('create', () => {
    it('creates a review for a completed booking owned by the caller', async () => {
      const result = await fixture.service.create(renter, 1, {
        rating: 5,
        comment: 'Great!',
      });

      expect(result).toEqual(
        expect.objectContaining({
          bookingId: 1,
          renterId: 7,
          mateId: 3,
          rating: 5,
          comment: 'Great!',
        }),
      );
      expect(fixture.reviewRows).toHaveLength(1);
    });

    it('derives renterId/mateId from the booking rather than trusting input', async () => {
      const result = await fixture.service.create(renter, 1, { rating: 4 });
      expect(result.renterId).toBe(7);
      expect(result.mateId).toBe(3);
    });

    it('defaults comment to null when omitted', async () => {
      const result = await fixture.service.create(renter, 1, { rating: 4 });
      expect(result.comment).toBeNull();
    });

    it('rejects a booking that is not completed with 422 BOOKING_NOT_COMPLETED', async () => {
      await expect(
        fixture.service.create(renter, 2, { rating: 5 }),
      ).rejects.toMatchObject({
        message: 'BOOKING_NOT_COMPLETED',
      });
      await expect(
        fixture.service.create(renter, 2, { rating: 5 }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rejects a second review for the same booking with 409 REVIEW_ALREADY_EXISTS', async () => {
      await fixture.service.create(renter, 1, { rating: 5 });
      await expect(
        fixture.service.create(renter, 1, { rating: 3 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns 404 for a non-existent booking', async () => {
      await expect(
        fixture.service.create(renter, 999, { rating: 5 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns 404 (not 403) when the caller is not the booking renter', async () => {
      await expect(
        fixture.service.create(stranger, 1, { rating: 5 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('edits rating and comment as the review owner', async () => {
      const created = await fixture.service.create(renter, 1, { rating: 3 });
      const updated = await fixture.service.update(renter, created.id, {
        rating: 5,
        comment: 'Updated',
      });

      expect(updated).toEqual(
        expect.objectContaining({ rating: 5, comment: 'Updated' }),
      );
    });

    it('allows a partial update of only rating', async () => {
      const created = await fixture.service.create(renter, 1, {
        rating: 3,
        comment: 'Ok',
      });
      const updated = await fixture.service.update(renter, created.id, {
        rating: 4,
      });

      expect(updated.rating).toBe(4);
      expect(updated.comment).toBe('Ok');
    });

    it('rejects an update with neither field supplied', async () => {
      const created = await fixture.service.create(renter, 1, { rating: 3 });
      await expect(
        fixture.service.update(renter, created.id, {}),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('returns 404 for a non-owner (not 403), to avoid leaking existence', async () => {
      const created = await fixture.service.create(renter, 1, { rating: 3 });
      await expect(
        fixture.service.update(stranger, created.id, { rating: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns 404 for a non-existent review', async () => {
      await expect(
        fixture.service.update(renter, 999, { rating: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('removes the review as its owner', async () => {
      const created = await fixture.service.create(renter, 1, { rating: 3 });
      await fixture.service.remove(renter, created.id);
      expect(fixture.reviewRows).toHaveLength(0);
    });

    it('removes the review as an admin', async () => {
      const created = await fixture.service.create(renter, 1, { rating: 3 });
      await fixture.service.remove(admin, created.id);
      expect(fixture.reviewRows).toHaveLength(0);
    });

    it('rejects removal by a non-owner, non-admin caller', async () => {
      const created = await fixture.service.create(renter, 1, { rating: 3 });
      await expect(
        fixture.service.remove(stranger, created.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(fixture.reviewRows).toHaveLength(1);
    });

    it('returns 404 for a non-existent review', async () => {
      await expect(fixture.service.remove(renter, 999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
