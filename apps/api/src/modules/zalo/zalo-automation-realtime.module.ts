import { Module } from '@nestjs/common';
import { ZaloAutomationGateway } from './zalo-automation.gateway';
import { ZaloAutomationRealtimeService } from './zalo-automation-realtime.service';

@Module({
  providers: [ZaloAutomationRealtimeService, ZaloAutomationGateway],
  exports: [ZaloAutomationRealtimeService]
})
export class ZaloAutomationRealtimeModule {}
