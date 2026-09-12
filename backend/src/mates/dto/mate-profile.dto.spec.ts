import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateMateProfileDto, UpdateMateProfileDto } from './index.js';

async function errorsFor<T extends object>(type: new () => T, input: object) {
  return validate(plainToInstance(type, input));
}

describe('CreateMateProfileDto', () => {
  it('accepts the complete profile payload', async () => {
    await expect(
      errorsFor(CreateMateProfileDto, {
        age: 25,
        bio: 'Friendly and punctual',
        hourlyRate: 350,
        provinceId: 1,
        districtId: 4,
        activityIds: [2, 5],
        interestIds: [1, 3],
      }),
    ).resolves.toHaveLength(0);
  });

  it('rejects invalid age, rate precision, and duplicate lookup IDs', async () => {
    const errors = await errorsFor(CreateMateProfileDto, {
      age: 17,
      bio: 'Profile',
      hourlyRate: 10.123,
      provinceId: 1,
      districtId: 4,
      activityIds: [2, 2],
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('UpdateMateProfileDto', () => {
  it('accepts a partial update', async () => {
    await expect(errorsFor(UpdateMateProfileDto, { bio: 'Updated bio' })).resolves.toHaveLength(0);
  });
});
