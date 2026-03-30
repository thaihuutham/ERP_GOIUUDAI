import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { ZaloController } from './zalo.controller';
import { ZaloPersonalPoolService } from './zalo-personal.pool.service';
import { ZaloService } from './zalo.service';

@Module({
  imports: [ConversationsModule],
  controllers: [ZaloController],
  providers: [ZaloService, ZaloPersonalPoolService],
  exports: [ZaloService]
})
export class ZaloModule {}
