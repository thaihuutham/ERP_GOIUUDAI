import { Module } from '@nestjs/common';
import { ConversationQualityController } from './conversation-quality.controller';
import { ConversationQualityService } from './conversation-quality.service';

@Module({
  controllers: [ConversationQualityController],
  providers: [ConversationQualityService],
  exports: [ConversationQualityService]
})
export class ConversationQualityModule {}
