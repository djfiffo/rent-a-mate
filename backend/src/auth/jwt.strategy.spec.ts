import { afterEach, describe, expect, it } from 'vitest';
import { JwtStrategy } from './jwt.strategy.js';

const originalAccessSecret = process.env.JWT_ACCESS_SECRET;

describe('JwtStrategy', () => {
  afterEach(() => {
    if (originalAccessSecret === undefined) {
      delete process.env.JWT_ACCESS_SECRET;
    } else {
      process.env.JWT_ACCESS_SECRET = originalAccessSecret;
    }
  });

  it('initializes when JWT_ACCESS_SECRET is configured', () => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';

    expect(() => new JwtStrategy()).not.toThrow();
  });

  it.each([undefined, '', '   '])(
    'rejects an unconfigured JWT_ACCESS_SECRET (%s)',
    (secret) => {
      if (secret === undefined) {
        delete process.env.JWT_ACCESS_SECRET;
      } else {
        process.env.JWT_ACCESS_SECRET = secret;
      }

      expect(() => new JwtStrategy()).toThrow(
        'JWT_ACCESS_SECRET is not configured',
      );
    },
  );
});
