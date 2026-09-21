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
import { successResponse, type ApiResponse } from '../shared/http/api-response.js';
import { CurrentUser } from '../users/decorators/current-user.decorator.js';
import type { AuthUser } from '../shared/types/auth-user.js';
import type { PaginatedResult } from '../shared/types/pagination.js';
import { CreateMessageDto } from './dto/create-message.dto.js';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto.js';
import { MessagesService } from './messages.service.js';
import type { CreateMessageResult, MessageRecord } from './messages.types.js';

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
    return successResponse('OK', result);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser | undefined,
    @Param('bookingId', ParseIntPipe) bookingId: number,
    @Body() dto: CreateMessageDto,
  ): Promise<ApiResponse<CreateMessageResult>> {
    const authUser = this.requireUser(user);
    const result = await this.messagesService.create(authUser, bookingId, dto);
    return successResponse('Message sent', result);
  }

  private requireUser(user: AuthUser | undefined): AuthUser {
    if (!user?.id) {
      throw new UnauthorizedException('Authentication is required');
    }
    return user;
  }

}
