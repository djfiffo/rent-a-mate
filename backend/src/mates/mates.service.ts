import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Temporal } from '@js-temporal/polyfill';
import { CreateMateProfileDto } from './dto/create-mate-profile.dto.js';
import { UpdateMateProfileDto } from './dto/update-mate-profile.dto.js';
import { CreateMatePhotoDto, UploadMatePhotoDto } from './dto/create-mate-photo.dto.js';
import { MATES_DATABASE_TOKEN } from './mates.tokens.js';
import {
  LocalMateStorageProvider,
  MATE_STORAGE_TOKEN,
  type MateUpload,
  type MateStorageProvider,
} from './mate-storage.js';
import type {
  MateDatabase,
  MateLookup,
  MatePhotoRecord,
  MateProfile,
  MateRecord,
  MateUpdate,
} from './mates.types.js';

const MAX_GALLERY_SIZE = 6;

@Injectable()
export class MatesService {
  constructor(
    @Inject(MATES_DATABASE_TOKEN) private readonly database: MateDatabase,
    @Optional()
    @Inject(MATE_STORAGE_TOKEN)
    private readonly storage: MateStorageProvider = new LocalMateStorageProvider(),
  ) {}

  async create(userId: number, input: CreateMateProfileDto): Promise<MateProfile> {
    const created = await this.database.transaction(async (transaction) => {
      if (await transaction.orm.public.Mate.where({ userId }).first()) {
        throw new ConflictException('Mate profile already exists');
      }

      await this.validateLookups(transaction, input.provinceId, input.districtId, input.activityIds, input.interestIds);
      if (!(await transaction.orm.public.User.where({ id: userId }).first())) {
        throw new NotFoundException('User not found');
      }

      const mate = await transaction.orm.public.Mate.create({
        userId,
        age: input.age,
        bio: input.bio,
        hourlyRate: input.hourlyRate,
        provinceId: input.provinceId,
        districtId: input.districtId,
        isActive: true,
        deactiveAt: null,
      });

      await Promise.all([
        ...(input.activityIds ?? []).map((activityId) =>
          transaction.orm.public.MateActivity.create({ mateId: mate.id, activityId }),
        ),
        ...(input.interestIds ?? []).map((interestId) =>
          transaction.orm.public.MateInterest.create({ mateId: mate.id, interestId }),
        ),
      ]);

      return mate;
    });

    return this.getProfileByMate(created);
  }

  async getProfile(userId: number): Promise<MateProfile> {
    const mate = await this.requireMate(userId);
    return this.getProfileByMate(mate);
  }

  async update(userId: number, input: UpdateMateProfileDto): Promise<MateProfile> {
    const updated = await this.database.transaction(async (transaction) => {
      const mate = await this.requireMate(userId, transaction);
      this.ensureActive(mate);
      const update = this.toMateUpdate(input);

      if (Object.keys(update).length === 0 && input.activityIds === undefined && input.interestIds === undefined) {
        throw new BadRequestException('At least one profile field is required');
      }

      const provinceId = input.provinceId ?? mate.provinceId;
      const districtId = input.districtId ?? mate.districtId;
      await this.validateLookups(transaction, provinceId, districtId, input.activityIds, input.interestIds);

      const saved = Object.keys(update).length
        ? await transaction.orm.public.Mate.where({ id: mate.id }).update(update)
        : mate;

      if (input.activityIds !== undefined) {
        await transaction.orm.public.MateActivity.where({ mateId: mate.id }).deleteAndCount();
        await Promise.all(
          input.activityIds.map((activityId) =>
            transaction.orm.public.MateActivity.create({ mateId: mate.id, activityId }),
          ),
        );
      }

      if (input.interestIds !== undefined) {
        await transaction.orm.public.MateInterest.where({ mateId: mate.id }).deleteAndCount();
        await Promise.all(
          input.interestIds.map((interestId) =>
            transaction.orm.public.MateInterest.create({ mateId: mate.id, interestId }),
          ),
        );
      }

      return this.requireRecordSync(saved, 'Mate profile not found');
    });

    return this.getProfileByMate(updated);
  }

  async deactivate(userId: number): Promise<MateProfile> {
    const updated = await this.database.transaction(async (transaction) => {
      const mate = await this.requireMate(userId, transaction);
      if (mate.isActive === false) return mate;

      const saved = await transaction.orm.public.Mate.where({ id: mate.id }).update({
        isActive: false,
        deactiveAt: Temporal.Now.instant(),
      });
      return this.requireRecordSync(saved, 'Mate profile not found');
    });

    return this.getProfileByMate(updated);
  }

  async addPhoto(userId: number, input: UploadMatePhotoDto | CreateMatePhotoDto, file?: MateUpload): Promise<MatePhotoRecord> {
    const mate = await this.requireMate(userId);
    this.ensureActive(mate);

    const photoModel = this.photoModel(this.database);
    if (!photoModel) {
      throw new UnprocessableEntityException('Mate gallery storage is not configured');
    }

    const existing = await photoModel.where({ mateId: mate.id }).all();
    if (existing.length >= MAX_GALLERY_SIZE) {
      throw new ConflictException('Mate gallery cannot contain more than 6 photos');
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
          // Keep the original database error. A future storage reconciler can
          // clean up an object if the provider is temporarily unavailable.
        }
      }
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Mate gallery slot is no longer available');
      }
      throw error;
    }
  }

  private async storeUpload(mateId: number, file: MateUpload): Promise<{ url: string; storageKey: string }> {
    if (!file || !file.buffer || !this.isSupportedImage(file)) {
      throw new BadRequestException('Only image files are allowed');
    }
    if (file.buffer.length > 5 * 1024 * 1024) {
      throw new BadRequestException('Photo exceeds the 5 MB limit');
    }
    return this.storage.store(mateId, file);
  }

  private isSupportedImage(file: MateUpload): boolean {
    const header = file.buffer.subarray(0, 12);
    if (file.mimetype === 'image/jpeg') return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    if (file.mimetype === 'image/png') return header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (file.mimetype === 'image/gif') return header.subarray(0, 6).toString('ascii') === 'GIF87a' || header.subarray(0, 6).toString('ascii') === 'GIF89a';
    if (file.mimetype === 'image/webp') return header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WEBP';
    return false;
  }

  async removePhoto(userId: number, photoId: number): Promise<void> {
    const mate = await this.requireMate(userId);
    const photoModel = this.photoModel(this.database);
    if (!photoModel) {
      throw new UnprocessableEntityException('Mate gallery storage is not configured');
    }

    const photo = await photoModel.where({ id: photoId, mateId: mate.id }).first();
    if (!photo) throw new NotFoundException('Mate photo not found');

    // Provider deletion precedes record deletion. If a provider fails, the
    // metadata remains available for a retry and no gallery record is lost.
    if (photo.storageKey && this.isOwnedStorageKey(photo.storageKey, mate.id)) {
      await this.storage.remove(photo.storageKey);
    }
    await photoModel.where({ id: photo.id, mateId: mate.id }).delete();
  }

  private isOwnedStorageKey(storageKey: string, mateId: number): boolean {
    return storageKey.startsWith(`mates/${mateId}/`) || storageKey.startsWith(`local/mates/${mateId}/`);
  }

  private async getProfileByMate(mate: MateRecord): Promise<MateProfile> {
    const photoModel = this.photoModel(this.database);
    const availabilityModel = this.availabilityModel(this.database);
    const [user, province, district, activityLinks, interestLinks, photos, availability] = await Promise.all([
      this.database.orm.public.User.where({ id: mate.userId }).first(),
      this.database.orm.public.Province.where({ id: mate.provinceId }).first(),
      this.database.orm.public.District.where({ id: mate.districtId }).first(),
      this.database.orm.public.MateActivity.where({ mateId: mate.id }).all(),
      this.database.orm.public.MateInterest.where({ mateId: mate.id }).all(),
      photoModel?.where({ mateId: mate.id }).all() ?? Promise.resolve([]),
      availabilityModel?.where({ mateId: mate.id }).all() ?? Promise.resolve([]),
    ]);

    const [activities, interests] = await Promise.all([
      Promise.all(activityLinks.map((link) => this.database.orm.public.Activity.where({ id: link.activityId }).first())),
      Promise.all(interestLinks.map((link) => this.database.orm.public.Interest.where({ id: link.interestId }).first())),
    ]);

    return {
      id: mate.id,
      user: this.requireRecordSync(user, 'User not found'),
      age: mate.age,
      bio: mate.bio,
      hourlyRate: mate.hourlyRate,
      isActive: mate.isActive !== false,
      deactivatedAt: mate.deactiveAt ?? null,
      province: this.toLookup(this.requireRecordSync(province, 'Province not found')),
      district: this.toLookup(this.requireRecordSync(district, 'District not found')),
      activities: activities.filter((activity): activity is { id: number; name: string } => activity !== null).map((activity) => this.toLookup(activity)),
      interests: interests.filter((interest): interest is { id: number; name: string } => interest !== null).map((interest) => this.toLookup(interest)),
      photos: photos.sort((left, right) => left.sortOrder - right.sortOrder),
      availability: availability.sort((left, right) => left.dayOfWeek - right.dayOfWeek || this.timeToMinutes(left.startTime) - this.timeToMinutes(right.startTime)),
      createdAt: mate.createdAt,
      updatedAt: mate.updatedAt,
    };
  }

  private async requireMate(userId: number, source: MateDatabase = this.database): Promise<MateRecord> {
    return this.requireRecord(source.orm.public.Mate.where({ userId }).first(), 'Mate profile not found');
  }

  private ensureActive(mate: MateRecord): void {
    if (mate.isActive === false) {
      throw new UnprocessableEntityException('Mate profile is not active');
    }
  }

  private photoModel(database: MateDatabase): MateDatabase['orm']['public']['MatePhoto'] | undefined {
    return (database.orm.public as MateDatabase['orm']['public'] & {
      MatePhoto?: MateDatabase['orm']['public']['MatePhoto'];
    }).MatePhoto;
  }

  private availabilityModel(database: MateDatabase): MateDatabase['orm']['public']['MateAvailability'] | undefined {
    return (database.orm.public as MateDatabase['orm']['public'] & {
      MateAvailability?: MateDatabase['orm']['public']['MateAvailability'];
    }).MateAvailability;
  }

  private async validateLookups(
    source: MateDatabase,
    provinceId: number,
    districtId: number,
    activityIds?: number[],
    interestIds?: number[],
  ): Promise<void> {
    const [province, district, activities, interests] = await Promise.all([
      source.orm.public.Province.where({ id: provinceId }).first(),
      source.orm.public.District.where({ id: districtId }).first(),
      Promise.all((activityIds ?? []).map((activityId) => source.orm.public.Activity.where({ id: activityId }).first())),
      Promise.all((interestIds ?? []).map((interestId) => source.orm.public.Interest.where({ id: interestId }).first())),
    ]);

    if (!province || !district || district.provinceId !== province.id) {
      throw new UnprocessableEntityException('INVALID_LOOKUP_REFERENCE');
    }
    if (activities.some((activity) => !activity) || interests.some((interest) => !interest)) {
      throw new UnprocessableEntityException('INVALID_LOOKUP_REFERENCE');
    }
  }

  private toMateUpdate(input: UpdateMateProfileDto): MateUpdate {
    const update: MateUpdate = {};
    if (input.age !== undefined) update.age = input.age;
    if (input.bio !== undefined) update.bio = input.bio;
    if (input.hourlyRate !== undefined) update.hourlyRate = input.hourlyRate;
    if (input.provinceId !== undefined) update.provinceId = input.provinceId;
    if (input.districtId !== undefined) update.districtId = input.districtId;
    return update;
  }

  private async requireRecord<T>(record: Promise<T | null>, message: string): Promise<T> {
    return this.requireRecordSync(await record, message);
  }

  private requireRecordSync<T>(record: T | null, message: string): T {
    if (!record) throw new NotFoundException(message);
    return record;
  }

  private toLookup(record: { id: number; name: string }): MateLookup {
    return { id: record.id, name: record.name };
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
