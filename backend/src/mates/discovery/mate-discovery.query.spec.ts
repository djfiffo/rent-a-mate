import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { describe, expect, it } from 'vitest';
import { ListMatesQueryDto } from './dto/list-mates-query.dto.js';
import { normalizeMateDiscoveryQuery } from './mate-discovery.query.js';

describe('normalizeMateDiscoveryQuery', () => {
  it('normalizes validated filters and applies documented defaults', () => {
    const input = plainToInstance(ListMatesQueryDto, {
      q: '  Nan  ',
      activityId: ['2', '5'],
      interestId: ['3'],
      minRate: '200',
      maxRate: '500',
      availableDate: '2026-09-12',
      minRating: '4.5',
    });

    expect(normalizeMateDiscoveryQuery(input)).toEqual({
      q: 'Nan',
      activityIds: [2, 5],
      interestIds: [3],
      provinceId: undefined,
      districtId: undefined,
      minRate: '200',
      maxRate: '500',
      availableDate: '2026-09-12',
      minRating: 4.5,
      sort: '-createdAt',
      page: 1,
      limit: 20,
      skip: 0,
    });
  });
});
