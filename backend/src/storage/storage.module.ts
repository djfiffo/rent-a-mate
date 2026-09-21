import { Module } from '@nestjs/common';
import { NestMinioModule } from 'nestjs-minio';
import { MATE_STORAGE_TOKEN } from '../mates/gallery/mate-storage.js';
import { LocalMateStorageProvider } from './local-mate-storage.provider.js';
import { MINIO_STORAGE_CONFIG, MinioMateStorageProvider } from './minio-mate-storage.provider.js';
import { readMinioConfig } from './minio.config.js';

const minioConfig = readMinioConfig();
const minioImports = minioConfig
  ? [
      NestMinioModule.register({
        endPoint: minioConfig.endPoint,
        port: minioConfig.port,
        useSSL: minioConfig.useSSL,
        accessKey: minioConfig.accessKey,
        secretKey: minioConfig.secretKey,
        retries: 2,
        retryDelay: 500,
      }),
    ]
  : [];

@Module({
  imports: minioImports,
  providers: minioConfig
    ? [
        { provide: MINIO_STORAGE_CONFIG, useValue: minioConfig },
        MinioMateStorageProvider,
        { provide: MATE_STORAGE_TOKEN, useExisting: MinioMateStorageProvider },
      ]
    : [{ provide: MATE_STORAGE_TOKEN, useClass: LocalMateStorageProvider }],
  exports: [MATE_STORAGE_TOKEN],
})
export class StorageModule {}
