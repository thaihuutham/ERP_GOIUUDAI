import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ConversationQualityService } from './conversation-quality.service';

@Controller('conversation-quality')
export class ConversationQualityController {
  constructor(
    @Inject(ConversationQualityService) private readonly conversationQualityService: ConversationQualityService
  ) {}

  @Get('jobs')
  listJobs() {
    return this.conversationQualityService.listJobs();
  }

  @Post('jobs')
  createJob(@Body() body: Record<string, unknown>) {
    return this.conversationQualityService.createJob(body);
  }

  @Patch('jobs/:id')
  updateJob(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.conversationQualityService.updateJob(id, body);
  }

  @Post('jobs/:id/run-now')
  runJobNow(@Param('id') id: string) {
    return this.conversationQualityService.runJobNow(id);
  }

  @Get('runs')
  listRuns(@Query('jobId') jobId?: string) {
    return this.conversationQualityService.listRuns(jobId);
  }

  @Get('runs/:id')
  getRun(@Param('id') id: string) {
    return this.conversationQualityService.getRun(id);
  }
}
