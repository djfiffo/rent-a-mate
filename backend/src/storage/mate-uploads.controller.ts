import {
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Query,
  ServiceUnavailableException,
  StreamableFile,
} from '@nestjs/common';
import type { Client } from 'minio';
import { MINIO_CONNECTION } from 'nestjs-minio';
import { MINIO_STORAGE_CONFIG } from './minio-mate-storage.provider.js';
import type { MinioStorageConfig } from './minio.config.js';

const photoKey =
  /^mates\/[1-9]\d*\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\.(jpg|png|gif|webp)$/i;
const mimeTypes = {
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
} as const;

@Controller('uploads')
export class MateUploadsController {
  constructor(
    @Inject(MINIO_CONNECTION) private readonly client: Client,
    @Inject(MINIO_STORAGE_CONFIG) private readonly config: MinioStorageConfig,
  ) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async getPhoto(@Query('key') key: string): Promise<StreamableFile> {
    const match = photoKey.exec(key ?? '');
    if (!match) throw new NotFoundException('Photo not found');

    try {
      const stream = await this.client.getObject(this.config.bucket, key);
      return new StreamableFile(stream, {
        type: mimeTypes[match[1].toLowerCase() as keyof typeof mimeTypes],
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'NoSuchKey' || code === 'NotFound')
        throw new NotFoundException('Photo not found');
      throw new ServiceUnavailableException('Photo storage is unavailable');
    }
  }
}
