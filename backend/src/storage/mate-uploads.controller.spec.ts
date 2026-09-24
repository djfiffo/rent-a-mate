import { Readable } from 'node:stream';
import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MateUploadsController } from './mate-uploads.controller.js';
import type { MinioStorageConfig } from './minio.config.js';

const config = { bucket: 'matefor' } as MinioStorageConfig;
const key = 'mates/42/00000000-0000-4000-8000-000000000000.png';

describe('MateUploadsController', () => {
  it('rejects keys outside the generated public mate photo path', async () => {
    const client = { getObject: vi.fn() };
    const controller = new MateUploadsController(client as never, config);

    await expect(controller.getPhoto('../private/file.png')).rejects.toBeInstanceOf(NotFoundException);
    expect(client.getObject).not.toHaveBeenCalled();
  });

  it('streams an existing mate photo with its image type', async () => {
    const client = { getObject: vi.fn().mockResolvedValue(Readable.from([Buffer.from('png')])) };
    const controller = new MateUploadsController(client as never, config);

    const file = await controller.getPhoto(key);

    expect(client.getObject).toHaveBeenCalledWith('matefor', key);
    expect(file.getHeaders().type).toBe('image/png');
  });
});
