import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { ZaloAiN8nCallbackController, ZaloAiRoutingController } from './zalo-ai-routing.controller';
import { ZaloAiJobsService } from './zalo-ai-jobs.service';
import { ZaloAiRoutingService } from './zalo-ai-routing.service';
import { ZaloController } from './zalo.controller';
import { ZaloAutomationRealtimeModule } from './zalo-automation-realtime.module';
import { ZaloCampaignSchedulerService } from './zalo-campaign-scheduler.service';
import { ZaloCampaignService } from './zalo-campaign.service';
import { ZaloAutoReplyService } from './zalo-auto-reply.service';
import { ZaloOaOutboundWorkerService } from './zalo-oa-outbound.worker';
import { ZaloPersonalPoolService } from './zalo-personal.pool.service';
import { ZaloService } from './zalo.service';

@Module({
  imports: [ConversationsModule, ZaloAutomationRealtimeModule],
  controllers: [ZaloController, ZaloAiRoutingController, ZaloAiN8nCallbackController],
  providers: [
    ZaloService,
    ZaloPersonalPoolService,
    ZaloOaOutboundWorkerService,
    ZaloCampaignService,
    ZaloCampaignSchedulerService,
    ZaloAutoReplyService,
    ZaloAiRoutingService,
    ZaloAiJobsService
  ],
  exports: [ZaloService]
})
export class ZaloModule {}
