import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../users/decorators/current-user.decorator.js';
import type { AuthUser } from '../users/users.types.js';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto.js';
import { NotificationsService } from './notifications.service.js';
import type { NotificationRecord } from './notifications.types.js';

interface ApiResponse<T> {
  status: 'success';
  message: string;
  data: T;
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser | undefined,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<ApiResponse<{ notifications: NotificationRecord[] }>> {
    const notifications = await this.notificationsService.findMine(
      this.requireUserId(user),
      query.unreadOnly === true,
    );
    return this.success('Notifications retrieved', { notifications });
  }

  @Patch(':notificationId/read')
  async markRead(
    @CurrentUser() user: AuthUser | undefined,
    @Param('notificationId', ParseIntPipe) notificationId: number,
  ): Promise<ApiResponse<{ notification: NotificationRecord }>> {
    const notification = await this.notificationsService.markRead(this.requireUserId(user), notificationId);
    return this.success('Notification marked as read', { notification });
  }

  @Patch('read-all')
  async markAllRead(
    @CurrentUser() user: AuthUser | undefined,
  ): Promise<ApiResponse<{ updated: number }>> {
    const result = await this.notificationsService.markAllRead(this.requireUserId(user));
    return this.success('Notifications marked as read', result);
  }

  private requireUserId(user?: AuthUser): number {
    if (!user || !Number.isInteger(user.id) || user.id <= 0) {
      throw new ForbiddenException('Authenticated identity is required');
    }
    return user.id;
  }

  private success<T>(message: string, data: T): ApiResponse<T> {
    return { status: 'success', message, data };
  }
}
