import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ConversationChannel } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ConversationsService } from './conversations.service';

@Controller('conversations')
export class ConversationsController {
  constructor(@Inject(ConversationsService) private readonly conversationsService: ConversationsService) {}

  @Get('threads')
  listThreads(
    @Query() query: PaginationQueryDto,
    @Query('channel') channel?: ConversationChannel | 'ALL',
    @Query('channelAccountId') channelAccountId?: string,
    @Query('customerId') customerId?: string
  ) {
    return this.conversationsService.listThreads(query, {
      channel,
      channelAccountId,
      customerId
    });
  }

  @Post('threads')
  createThread(@Body() body: Record<string, unknown>) {
    return this.conversationsService.createThread(body);
  }

  @Get('threads/:id/messages')
  listMessages(@Param('id') threadId: string, @Query() query: PaginationQueryDto) {
    return this.conversationsService.listMessages(threadId, query);
  }

  @Post('threads/:id/messages')
  appendMessage(@Param('id') threadId: string, @Body() body: Record<string, unknown>) {
    return this.conversationsService.appendMessage(threadId, body);
  }

  @Get('threads/:id/evaluation/latest')
  getLatestEvaluation(@Param('id') threadId: string) {
    return this.conversationsService.getLatestEvaluation(threadId);
  }
}
