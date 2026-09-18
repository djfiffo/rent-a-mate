import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../users/decorators/current-user.decorator.js';
import type { AuthUser } from '../users/users.types.js';
import type { PaginatedResult } from '../admin/admin.types.js';
import { CreateMessageDto } from './dto/create-message.dto.js';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto.js';
import { MessagesService } from './messages.service.js';
import type { CreateMessageResult, MessageRecord } from './messages.types.js';

interface ApiResponse<T> {
  status: 'success';
  message: string;
  data: T;
}

/**
 * REST surface for booking chat, per spec 6.7. Nested under `/bookings`
 * because a message only ever exists in the context of one booking and
 * both participants are already resolved from the booking record — see
 * `MessagesService.assertParticipant()`.
 */
@Controller('bookings/:bookingId/messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser | undefined,
    @Param('bookingId', ParseIntPipe) bookingId: number,
    @Query() query: ListMessagesQueryDto,
  ): Promise<ApiResponse<PaginatedResult<MessageRecord>>> {
    const authUser = this.requireUser(user);
    const result = await this.messagesService.list(authUser, bookingId, query);
    return this.success('OK', result);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser | undefined,
    @Param('bookingId', ParseIntPipe) bookingId: number,
    @Body() dto: CreateMessageDto,
  ): Promise<ApiResponse<CreateMessageResult>> {
    const authUser = this.requireUser(user);
    const result = await this.messagesService.create(authUser, bookingId, dto);
    return this.success('Message sent', result);
  }

  private requireUser(user: AuthUser | undefined): AuthUser {
    if (!user?.id) {
      throw new UnauthorizedException('Authentication is required');
    }
    return user;
  }

  private success<T>(message: string, data: T): ApiResponse<T> {
    return { status: 'success', message, data };
  }
}
