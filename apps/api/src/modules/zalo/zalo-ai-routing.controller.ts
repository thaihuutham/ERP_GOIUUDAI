import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Public, Roles } from '../../common/auth/auth.decorators';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ZaloAiJobsService } from './zalo-ai-jobs.service';
import { ZaloAiRoutingService } from './zalo-ai-routing.service';
import { ZaloService } from './zalo.service';

@Controller()
@Roles(UserRole.ADMIN)
export class ZaloAiRoutingController {
  constructor(
    @Inject(ZaloAiRoutingService) private readonly routingService: ZaloAiRoutingService,
    @Inject(ZaloAiJobsService) private readonly jobsService: ZaloAiJobsService
  ) {}

  @Get('ai-industries')
  listIndustries(@Query() query: PaginationQueryDto) {
    return this.routingService.listIndustries(query);
  }

  @Post('ai-industries')
  createIndustry(@Body() body: Record<string, unknown>) {
    return this.routingService.createIndustry(body);
  }

  @Patch('ai-industries/:id')
  updateIndustry(@Param('id') industryId: string, @Body() body: Record<string, unknown>) {
    return this.routingService.updateIndustry(industryId, body);
  }

  @Get('ai-routing/channel-accounts')
  listChannelMappings(
    @Query() query: PaginationQueryDto,
    @Query('channel') channel?: string,
    @Query('channelAccountId') channelAccountId?: string,
    @Query('isActive') isActive?: string
  ) {
    return this.routingService.listChannelMappings(query, {
      channel,
      channelAccountId,
      isActive
    });
  }

  @Post('ai-routing/channel-accounts')
  upsertChannelMapping(@Body() body: Record<string, unknown>) {
    return this.routingService.upsertChannelMapping(body);
  }

  @Patch('ai-routing/channel-accounts/:id')
  updateChannelMapping(@Param('id') mappingId: string, @Body() body: Record<string, unknown>) {
    return this.routingService.updateChannelMapping(mappingId, body);
  }

  @Get('ai-routing/industry-bindings')
  listIndustryBindings(
    @Query() query: PaginationQueryDto,
    @Query('isActive') isActive?: string
  ) {
    return this.routingService.listIndustryBindings(query, { isActive });
  }

  @Post('ai-routing/industry-bindings')
  upsertIndustryBinding(@Body() body: Record<string, unknown>) {
    return this.routingService.upsertIndustryBinding(body);
  }

  @Patch('ai-routing/industry-bindings/:id')
  updateIndustryBinding(@Param('id') bindingId: string, @Body() body: Record<string, unknown>) {
    return this.routingService.updateIndustryBinding(bindingId, body);
  }

  @Get('ai-jobs')
  listJobs(
    @Query() query: PaginationQueryDto,
    @Query('status') status?: string,
    @Query('channel') channel?: string,
    @Query('channelAccountId') channelAccountId?: string
  ) {
    return this.jobsService.listJobs({
      cursor: query.cursor,
      limit: query.limit,
      q: query.q,
      status,
      channel,
      channelAccountId
    });
  }

  @Get('ai-jobs/:id')
  getJobById(@Param('id') jobId: string) {
    return this.jobsService.getJobById(jobId);
  }
}

@Controller('integrations/n8n')
export class ZaloAiN8nCallbackController {
  constructor(
    @Inject(ZaloAiJobsService) private readonly jobsService: ZaloAiJobsService,
    @Inject(ZaloService) private readonly zaloService: ZaloService
  ) {}

  @Public()
  @Post('ai-replies')
  async ingestAiReply(
    @Body() body: Record<string, unknown>,
    @Req() req: { rawBody?: Buffer },
    @Headers('x-n8n-signature') signatureHeader?: string
  ) {
    const rawBody = req.rawBody?.toString('utf8') ?? JSON.stringify(body ?? {});
    await this.jobsService.verifyCallbackSignature(rawBody, signatureHeader);

    const decision = await this.jobsService.registerCallback(body);
    if (decision.action === 'NOOP') {
      return {
        success: true,
        duplicate: true,
        jobId: decision.jobId,
        status: decision.status
      };
    }

    if (decision.action === 'SKIP') {
      return {
        success: true,
        duplicate: false,
        dispatched: false,
        jobId: decision.jobId,
        status: decision.status,
        reason: decision.reason
      };
    }

    try {
      const sent = await this.zaloService.sendPersonalMessage(decision.accountId, {
        externalThreadId: decision.externalThreadId,
        content: decision.replyText,
        origin: 'AI',
        senderName: 'AI Assistant'
      });

      const replyMessageId = this.extractReplyMessageId(sent);
      await this.jobsService.markJobReplied(decision.jobId, replyMessageId || undefined);

      return {
        success: true,
        duplicate: false,
        dispatched: true,
        jobId: decision.jobId,
        eventId: decision.eventId,
        replyMessageId: replyMessageId || null,
        metadata: decision.metadata
      };
    } catch (error) {
      await this.jobsService.markJobFailed(decision.jobId, error);
      return {
        success: false,
        duplicate: false,
        dispatched: false,
        jobId: decision.jobId,
        eventId: decision.eventId,
        reason: error instanceof Error ? error.message : String(error ?? 'SEND_FAILED')
      };
    }
  }

  private extractReplyMessageId(sent: unknown) {
    if (!sent || typeof sent !== 'object') {
      return '';
    }

    const payload = sent as Record<string, unknown>;
    const candidate = String(payload.messageId ?? payload.id ?? '').trim();
    return candidate;
  }
}
