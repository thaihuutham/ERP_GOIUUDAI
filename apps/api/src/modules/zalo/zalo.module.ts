import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { ZaloController } from './zalo.controller';
import { ZaloOaOutboundWorkerService } from './zalo-oa-outbound.worker';
import { ZaloPersonalPoolService } from './zalo-personal.pool.service';
import { ZaloService } from './zalo.service';

@Module({
  imports: [ConversationsModule],
  controllers: [ZaloController],
  providers: [ZaloService, ZaloPersonalPoolService, ZaloOaOutboundWorkerService],
  exports: [ZaloService]
})
export class ZaloModule {}
