import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { ZaloController } from './zalo.controller';
import { ZaloAutomationRealtimeModule } from './zalo-automation-realtime.module';
import { ZaloCampaignSchedulerService } from './zalo-campaign-scheduler.service';
import { ZaloCampaignService } from './zalo-campaign.service';
import { ZaloOaOutboundWorkerService } from './zalo-oa-outbound.worker';
import { ZaloPersonalPoolService } from './zalo-personal.pool.service';
import { ZaloService } from './zalo.service';

@Module({
  imports: [ConversationsModule, ZaloAutomationRealtimeModule],
  controllers: [ZaloController],
  providers: [
    ZaloService,
    ZaloPersonalPoolService,
    ZaloOaOutboundWorkerService,
    ZaloCampaignService,
    ZaloCampaignSchedulerService,
  ],
  exports: [ZaloService]
})
export class ZaloModule {}
