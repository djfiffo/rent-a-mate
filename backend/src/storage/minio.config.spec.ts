import { describe, expect, it } from 'vitest';
import { readMinioConfig } from './minio.config.js';

const complete = {
  MINIO_ENDPOINT: 'http://localhost',
  MINIO_PORT: '9000',
  MINIO_USE_SSL: 'false',
  MINIO_ACCESS_KEY: 'minioadmin',
  MINIO_SECRET_KEY: 'minioadmin',
  MINIO_BUCKET: 'rent-a-mate',
  MINIO_PUBLIC_URL: 'http://localhost:9000/rent-a-mate',
};

describe('readMinioConfig', () => {
  it('normalizes a complete configuration', () => {
    expect(readMinioConfig(complete)).toEqual({
      endPoint: 'localhost',
      port: 9000,
      useSSL: false,
      accessKey: 'minioadmin',
      secretKey: 'minioadmin',
      bucket: 'rent-a-mate',
      publicUrl: 'http://localhost:9000/rent-a-mate',
    });
  });

  it('accepts a same-origin upload route for private object storage', () => {
    expect(
      readMinioConfig({ ...complete, MINIO_PUBLIC_URL: '/api/v1/uploads' })
        ?.publicUrl,
    ).toBe('/api/v1/uploads');
  });

  it('uses the local fallback when MinIO is not configured outside production', () => {
    expect(readMinioConfig({ NODE_ENV: 'test' })).toBeNull();
  });

  it('rejects partial configuration', () => {
    expect(() => readMinioConfig({ MINIO_ENDPOINT: 'localhost' })).toThrow(
      /Incomplete MinIO configuration/,
    );
  });
});
