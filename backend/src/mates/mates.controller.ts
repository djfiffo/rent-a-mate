import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../users/decorators/current-user.decorator.js';
import type { AuthUser } from '../users/users.types.js';
import { CreateMateProfileDto } from './dto/create-mate-profile.dto.js';
import { UpdateMateProfileDto  } from './dto/update-mate-profile.dto.js';
import { MatesService } from './mates.service.js';
import { CreateMateAvailabilityDto } from './dto/create-mate-availability.dto.js';
import { UpdateMateAvailabilityDto } from './dto/update-mate-availability.dto.js';
import { ReplaceMateAvailabilityDto } from './dto/replace-mate-availability.dto.js';
import { UploadMatePhotoDto } from './dto/create-mate-photo.dto.js';
import { MateAvailabilityService } from './mate-availability.service.js';
import type { MateProfile, MateAvailabilityRecord, MatePhotoRecord } from './mates.types.js';
interface ApiResponse<T> {
  status: 'success';
  message: string;
  data: T;
}

@Controller('mates')
@UseGuards(JwtAuthGuard)
export class MatesController {
  constructor(
    private readonly matesService: MatesService,
    // The default keeps direct unit-controller construction backwards
    // compatible; Nest supplies the real service in the application module.
    private readonly mateAvailabilityService: MateAvailabilityService = undefined as never,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthUser | undefined,
    @Body() input: CreateMateProfileDto,
  ): Promise<ApiResponse<{ mate: MateProfile }>> {
    const mate = await this.matesService.create(this.requireMateUserId(user), input);
    return this.success('Mate profile created', { mate });
  }

  @Get('me')
  async getProfile(@CurrentUser() user: AuthUser | undefined): Promise<ApiResponse<{ mate: MateProfile }>> {
    const mate = await this.matesService.getProfile(this.requireMateUserId(user));
    return this.success('Mate profile retrieved', { mate });
  }

  @Patch('me')
  async update(
    @CurrentUser() user: AuthUser | undefined,
    @Body() input: UpdateMateProfileDto,
  ): Promise<ApiResponse<{ mate: MateProfile }>> {
    const mate = await this.matesService.update(this.requireMateUserId(user), input);
    return this.success('Mate profile updated', { mate });
  }

  @Delete('me')
  async deactivate(
    @CurrentUser() user: AuthUser | undefined,
  ): Promise<ApiResponse<{ isActive: boolean; deactivatedAt: unknown }>> {
    const mate = await this.matesService.deactivate(this.requireMateUserId(user));
    return this.success('Mate profile deactivated', {
      isActive: mate.isActive,
      deactivatedAt: mate.deactivatedAt,
    });
  }

  @Post('me/photos')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_request, file, callback) => callback(null, file.mimetype.startsWith('image/')),
    }),
  )
  async addPhoto(
    @CurrentUser() user: AuthUser | undefined,
    @Body() input: UploadMatePhotoDto,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string },
  ): Promise<ApiResponse<{ photo: MatePhotoRecord }>> {
    const photo = await this.matesService.addPhoto(this.requireMateUserId(user), input, file);
    return this.success('Mate photo added', { photo });
  }

  @Delete('me/photos/:photoId')
  async removePhoto(
    @CurrentUser() user: AuthUser | undefined,
    @Param('photoId', ParseIntPipe) photoId: number,
  ): Promise<ApiResponse<null>> {
    await this.matesService.removePhoto(this.requireMateUserId(user), photoId);
    return this.success('Photo removed', null);
  }

  @Post('me/availability')
  @HttpCode(HttpStatus.CREATED)
  async createAvailability(
    @CurrentUser() user: AuthUser | undefined,
    @Body() input: CreateMateAvailabilityDto,
  ): Promise<ApiResponse<{ availability: MateAvailabilityRecord }>> {
    const availability =
      await this.mateAvailabilityService.create(
        this.requireMateUserId(user),
        input,
      );

    return this.success(
      'Mate availability created',
      { availability },
    );
  }

  @Get('me/availability')
  async getAvailability(
    @CurrentUser() user: AuthUser | undefined,
  ): Promise<ApiResponse<{ availability: MateAvailabilityRecord[] }>> {
    const availability =
      await this.mateAvailabilityService.findMine(
        this.requireMateUserId(user),
      );

    return this.success(
      'Mate availability retrieved',
      { availability },
    );
  }

  @Put('me/availability')
  async replaceAvailability(
    @CurrentUser() user: AuthUser | undefined,
    @Body() input: ReplaceMateAvailabilityDto,
  ): Promise<ApiResponse<{ slots: MateAvailabilityRecord[] }>> {
    const availability = await this.mateAvailabilityService.replace(
      this.requireMateUserId(user),
      input,
    );
    return this.success('Mate availability replaced', { slots: availability });
  }

  @Patch('me/availability/:availabilityId')
  async updateAvailability(
    @CurrentUser() user: AuthUser | undefined,
    @Param('availabilityId', ParseIntPipe) availabilityId: number,
    @Body() input: UpdateMateAvailabilityDto,
  ): Promise<ApiResponse<{ availability: MateAvailabilityRecord }>> {
    const availability =
      await this.mateAvailabilityService.update(
        this.requireMateUserId(user),
        availabilityId,
        input,
      );

    return this.success(
      'Mate availability updated',
      { availability },
    );
  }

  @Delete('me/availability/:availabilityId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAvailability(
    @CurrentUser() user: AuthUser | undefined,
    @Param('availabilityId', ParseIntPipe) availabilityId: number,
  ): Promise<void> {
    await this.mateAvailabilityService.remove(
      this.requireMateUserId(user),
      availabilityId,
    );
  }

  private requireMateUserId(user?: AuthUser): number {
    if (!user || !Number.isInteger(user.id) || user.id <= 0) {
      throw new ForbiddenException('Authenticated mate identity is required');
    }
    if (user.role !== 'mate') {
      throw new ForbiddenException('Mate role is required');
    }
    return user.id;
  }

  private success<T>(message: string, data: T): ApiResponse<T> {
    return { status: 'success', message, data };
  }
}
