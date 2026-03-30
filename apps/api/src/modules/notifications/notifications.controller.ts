import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notificationsService: NotificationsService) {}

  @Get()
  listNotifications(
    @Query() query: PaginationQueryDto,
    @Query('userId') userId?: string,
    @Query('unreadOnly') unreadOnly?: string
  ) {
    return this.notificationsService.list(query, userId, unreadOnly);
  }

  @Post()
  createNotification(@Body() body: Record<string, unknown>) {
    return this.notificationsService.create(body);
  }

  @Post(':id/read')
  markRead(@Param('id') id: string) {
    return this.notificationsService.markRead(id);
  }
}
