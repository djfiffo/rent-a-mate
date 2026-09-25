import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { MinioMateStorageProvider } from './minio-mate-storage.provider.js';
import type { MinioStorageConfig } from './minio.config.js';

const config: MinioStorageConfig = {
  endPoint: 'localhost',
  port: 9000,
  useSSL: false,
  accessKey: 'minioadmin',
  secretKey: 'minioadmin',
  bucket: 'rent-a-mate',
  publicUrl: 'http://localhost:9000/rent-a-mate',
};

describe('MinioMateStorageProvider', () => {
  it('creates the bucket when it does not exist and stores an object', async () => {
    const client = {
      bucketExists: vi.fn().mockResolvedValue(false),
      makeBucket: vi.fn().mockResolvedValue(undefined),
      putObject: vi.fn().mockResolvedValue({ etag: 'etag' }),
      removeObject: vi.fn().mockResolvedValue(undefined),
    } as never;
    const provider = new MinioMateStorageProvider(client, config);

    await provider.onModuleInit();
    const stored = await provider.store(42, {
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
      mimetype: 'image/jpeg',
    });

    expect(client.makeBucket).toHaveBeenCalledWith(config.bucket);
    expect(client.putObject).toHaveBeenCalledWith(
      config.bucket,
      expect.stringMatching(/^mates\/42\/.+\.jpg$/),
      expect.any(Buffer),
      3,
      { 'Content-Type': 'image/jpeg' },
    );
    expect(stored.url).toMatch(
      /^http:\/\/localhost:9000\/rent-a-mate\/mates\/42\/.+\.jpg$/,
    );
  });

  it('removes objects using the stored key', async () => {
    const client = {
      bucketExists: vi.fn(),
      makeBucket: vi.fn(),
      putObject: vi.fn(),
      removeObject: vi.fn().mockResolvedValue(undefined),
    } as never;
    const provider = new MinioMateStorageProvider(client, config);

    await provider.remove('mates/42/photo.jpg');

    expect(client.removeObject).toHaveBeenCalledWith(
      config.bucket,
      'mates/42/photo.jpg',
    );
  });
});
