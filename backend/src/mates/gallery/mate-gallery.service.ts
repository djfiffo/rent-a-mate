import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MATES_DATABASE_TOKEN } from '../internal/mates.tokens.js';
import type {
  MateDatabase,
  MatePhotoRecord,
  MateRecord,
} from '../internal/mates.types.js';
import {
  CreateMatePhotoDto,
  UploadMatePhotoDto,
} from './dto/create-mate-photo.dto.js';
import {
  MATE_STORAGE_TOKEN,
  type MateStorageProvider,
  type MateUpload,
} from './mate-storage.js';

const MAX_GALLERY_SIZE = 6;

@Injectable()
export class MateGalleryService {
  constructor(
    @Inject(MATES_DATABASE_TOKEN) private readonly database: MateDatabase,
    @Inject(MATE_STORAGE_TOKEN) private readonly storage: MateStorageProvider,
  ) {}

  async addPhoto(
    userId: number,
    input: UploadMatePhotoDto | CreateMatePhotoDto,
    file?: MateUpload,
  ): Promise<MatePhotoRecord> {
    const mate = await this.requireMate(userId);
    this.ensureActive(mate);

    const photoModel = this.photoModel();
    const existing = await photoModel.where({ mateId: mate.id }).all();
    if (existing.length >= MAX_GALLERY_SIZE) {
      throw new ConflictException(
        'Mate gallery cannot contain more than 6 photos',
      );
    }

    const occupied = new Set(existing.map((photo) => photo.sortOrder));
    let sortOrder = 0;
    while (occupied.has(sortOrder)) sortOrder += 1;

    const uploaded = file ? await this.storeUpload(mate.id, file) : undefined;
    const url = uploaded?.url ?? input.url?.trim();
    if (!url) throw new BadRequestException('A photo file or URL is required');

    try {
      return await photoModel.create({
        mateId: mate.id,
        url,
        storageKey: uploaded?.storageKey ?? null,
        sortOrder,
      });
    } catch (error) {
      if (uploaded) {
        try {
          await this.storage.remove(uploaded.storageKey);
        } catch {
          // Preserve the database error; orphan cleanup can be retried later.
        }
      }
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Mate gallery slot is no longer available');
      }
      throw error;
    }
  }

  async removePhoto(userId: number, photoId: number): Promise<void> {
    const mate = await this.requireMate(userId);
    const photoModel = this.photoModel();
    const photo = await photoModel
      .where({ id: photoId, mateId: mate.id })
      .first();
    if (!photo) throw new NotFoundException('Mate photo not found');

    if (photo.storageKey && this.isOwnedStorageKey(photo.storageKey, mate.id)) {
      await this.storage.remove(photo.storageKey);
    }
    await photoModel.where({ id: photo.id, mateId: mate.id }).delete();
  }

  private async storeUpload(
    mateId: number,
    file: MateUpload,
  ): Promise<{ url: string; storageKey: string }> {
    if (!file.buffer || !this.isSupportedImage(file)) {
      throw new BadRequestException('Only image files are allowed');
    }
    if (file.buffer.length > 5 * 1024 * 1024) {
      throw new BadRequestException('Photo exceeds the 5 MB limit');
    }
    return this.storage.store(mateId, file);
  }

  private isSupportedImage(file: MateUpload): boolean {
    const header = file.buffer.subarray(0, 12);
    if (file.mimetype === 'image/jpeg') {
      return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    }
    if (file.mimetype === 'image/png') {
      return header
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    if (file.mimetype === 'image/gif') {
      const signature = header.subarray(0, 6).toString('ascii');
      return signature === 'GIF87a' || signature === 'GIF89a';
    }
    if (file.mimetype === 'image/webp') {
      return (
        header.subarray(0, 4).toString('ascii') === 'RIFF' &&
        header.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    }
    return false;
  }

  private async requireMate(userId: number): Promise<MateRecord> {
    const mate = await this.database.orm.public.Mate.where({ userId }).first();
    if (!mate) throw new NotFoundException('Mate profile not found');
    return mate;
  }

  private ensureActive(mate: MateRecord): void {
    if (mate.isActive === false) {
      throw new UnprocessableEntityException('Mate profile is not active');
    }
  }

  private photoModel(): MateDatabase['orm']['public']['MatePhoto'] {
    const model = this.database.orm.public.MatePhoto;
    if (!model)
      throw new UnprocessableEntityException(
        'Mate gallery storage is not configured',
      );
    return model;
  }

  private isOwnedStorageKey(storageKey: string, mateId: number): boolean {
    return (
      storageKey.startsWith(`mates/${mateId}/`) ||
      storageKey.startsWith(`local/mates/${mateId}/`)
    );
  }
}

const isUniqueConstraintError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'P2002';
