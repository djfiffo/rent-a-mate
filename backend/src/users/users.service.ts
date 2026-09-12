import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DATABASE_TOKEN, PASSWORD_SERVICE } from './users.tokens.js';
import type { ChangeEmailDto, ChangePasswordDto, UpdateProfileDto } from './dto/index.js';
import type { PasswordService, SafeUser, UserDatabase, UserRecord } from './users.types.js';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE_TOKEN) private readonly database: UserDatabase,
    @Inject(PASSWORD_SERVICE) private readonly passwordService: PasswordService,
  ) {}

  async getProfile(userId: number): Promise<SafeUser> {
    return this.toSafeUser(await this.requireUser(userId));
  }

  async updateProfile(userId: number, input: UpdateProfileDto): Promise<SafeUser> {
    await this.requireUser(userId);
    return this.toSafeUser(
      await this.database.orm.public.User.where({ id: userId }).update({ name: input.name.trim() }),
    );
  }

  async changeEmail(userId: number, input: ChangeEmailDto): Promise<SafeUser> {
    const user = await this.requireUser(userId);
    await this.verifyCurrentPassword(user.password, input.currentPassword);
    const email = input.email.trim().toLowerCase();
    const existing = await this.database.orm.public.User.where({ email }).first();
    if (existing && existing.id !== userId) {
      throw new ConflictException('Email is already in use');
    }

    try {
      return this.toSafeUser(await this.database.orm.public.User.where({ id: userId }).update({ email }));
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Email is already in use');
      }
      throw error;
    }
  }

  async changePassword(userId: number, input: ChangePasswordDto): Promise<SafeUser> {
    const user = await this.requireUser(userId);
    await this.verifyCurrentPassword(user.password, input.currentPassword);
    const password = await this.passwordService.hash(input.newPassword);
    return this.toSafeUser(await this.database.orm.public.User.where({ id: userId }).update({ password }));
  }

  private async requireUser(userId: number): Promise<UserRecord> {
    const user = await this.database.orm.public.User.where({ id: userId }).first();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async verifyCurrentPassword(passwordHash: string, currentPassword: string): Promise<void> {
    const valid = await this.passwordService.verify(currentPassword, passwordHash);
    if (!valid) {
      throw new BadRequestException('Current password is invalid');
    }
  }

  private toSafeUser(user: UserRecord | null): SafeUser {
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
