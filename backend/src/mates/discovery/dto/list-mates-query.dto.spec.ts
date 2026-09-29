import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { ListMatesQueryDto } from './list-mates-query.dto.js';

const errorsFor = async (query: object) =>
  validate(plainToInstance(ListMatesQueryDto, query));

describe('ListMatesQueryDto', () => {
  it('rejects an inverted rate range', async () => {
    const errors = await errorsFor({ minRate: '501.50', maxRate: '500.00' });
    expect(errors.some((error) => error.property === 'maxRate')).toBe(true);
  });

  it('rejects a limit greater than 100 and an unknown sort', async () => {
    const errors = await errorsFor({ limit: '101', sort: 'name' });
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['limit', 'sort']),
    );
  });
});
