import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateMateProfileDto } from './dto/create-mate-profile.dto.js';
import { UpdateMateProfileDto  } from './dto/update-mate-profile.dto.js';
import { MATES_DATABASE_TOKEN } from './mates.tokens.js';
import type { MateDatabase, MateLookup, MateProfile, MateRecord, MateUpdate } from './mates.types.js';

@Injectable()
export class MatesService {
  constructor(@Inject(MATES_DATABASE_TOKEN) private readonly database: MateDatabase) {}

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
        await transaction.orm.public.MateActivity.where({ mateId: mate.id }).delete();
        await Promise.all(
          input.activityIds.map((activityId) =>
            transaction.orm.public.MateActivity.create({ mateId: mate.id, activityId }),
          ),
        );
      }

      if (input.interestIds !== undefined) {
        await transaction.orm.public.MateInterest.where({ mateId: mate.id }).delete();
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

  private async getProfileByMate(mate: MateRecord): Promise<MateProfile> {
    const [user, province, district, activityLinks, interestLinks] = await Promise.all([
      this.database.orm.public.User.where({ id: mate.userId }).first(),
      this.database.orm.public.Province.where({ id: mate.provinceId }).first(),
      this.database.orm.public.District.where({ id: mate.districtId }).first(),
      this.database.orm.public.MateActivity.where({ mateId: mate.id }).all(),
      this.database.orm.public.MateInterest.where({ mateId: mate.id }).all(),
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
      province: this.toLookup(this.requireRecordSync(province, 'Province not found')),
      district: this.toLookup(this.requireRecordSync(district, 'District not found')),
      activities: activities.filter((activity): activity is { id: number; name: string } => activity !== null).map((activity) => this.toLookup(activity)),
      interests: interests.filter((interest): interest is { id: number; name: string } => interest !== null).map((interest) => this.toLookup(interest)),
      createdAt: mate.createdAt,
      updatedAt: mate.updatedAt,
    };
  }

  private async requireMate(userId: number, source: MateDatabase = this.database): Promise<MateRecord> {
    return this.requireRecord(source.orm.public.Mate.where({ userId }).first(), 'Mate profile not found');
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
      throw new BadRequestException('Invalid province or district');
    }
    if (activities.some((activity) => !activity) || interests.some((interest) => !interest)) {
      throw new BadRequestException('Invalid activity or interest');
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
}
