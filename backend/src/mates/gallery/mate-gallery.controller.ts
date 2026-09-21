import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { successResponse, type ApiResponse } from '../../shared/http/api-response.js';
import { CurrentUser } from '../../shared/http/decorators/current-user.decorator.js';
import type { AuthUser } from '../../shared/types/auth-user.js';
import { requireMateUserId } from '../internal/require-mate-user.js';
import type { MatePhotoRecord } from '../internal/mates.types.js';
import { UploadMatePhotoDto } from './dto/create-mate-photo.dto.js';
import { MateGalleryService } from './mate-gallery.service.js';

@Controller('mates')
@UseGuards(JwtAuthGuard)
export class MateGalleryController {
  constructor(private readonly mateGalleryService: MateGalleryService) {}

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
    const photo = await this.mateGalleryService.addPhoto(requireMateUserId(user), input, file);
    return successResponse('Mate photo added', { photo });
  }

  @Delete('me/photos/:photoId')
  async removePhoto(
    @CurrentUser() user: AuthUser | undefined,
    @Param('photoId', ParseIntPipe) photoId: number,
  ): Promise<ApiResponse<null>> {
    await this.mateGalleryService.removePhoto(requireMateUserId(user), photoId);
    return successResponse('Photo removed', null);
  }
}
