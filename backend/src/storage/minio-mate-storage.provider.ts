import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Client } from 'minio';
import { MINIO_CONNECTION } from 'nestjs-minio';
import type { MateStorageProvider, MateUpload } from '../mates/gallery/mate-storage.js';
import type { MinioStorageConfig } from './minio.config.js';

export const MINIO_STORAGE_CONFIG = Symbol('MINIO_STORAGE_CONFIG');

@Injectable()
export class MinioMateStorageProvider implements MateStorageProvider, OnModuleInit {
  constructor(
    @Inject(MINIO_CONNECTION) private readonly client: Client,
    @Inject(MINIO_STORAGE_CONFIG) private readonly config: MinioStorageConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    const exists = await this.client.bucketExists(this.config.bucket);
    if (!exists) await this.client.makeBucket(this.config.bucket);
  }

  async store(mateId: number, file: MateUpload): Promise<{ url: string; storageKey: string }> {
    const extension = this.extensionFor(file.mimetype);
    const storageKey = `mates/${mateId}/${randomUUID()}${extension}`;
    await this.client.putObject(this.config.bucket, storageKey, file.buffer, file.buffer.length, {
      'Content-Type': file.mimetype,
    });
    return { storageKey, url: this.publicUrl(storageKey) };
  }

  async remove(storageKey: string): Promise<void> {
    await this.client.removeObject(this.config.bucket, storageKey);
  }

  private publicUrl(storageKey: string): string {
    const encodedKey = storageKey.split('/').map((part) => encodeURIComponent(part)).join('/');
    return `${this.config.publicUrl}/${encodedKey}`;
  }

  private extensionFor(mimetype: string): string {
    switch (mimetype) {
      case 'image/jpeg': return '.jpg';
      case 'image/png': return '.png';
      case 'image/gif': return '.gif';
      case 'image/webp': return '.webp';
      default: return '';
    }
  }
}
