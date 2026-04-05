import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { ZaloAccountAssignmentService } from '../zalo/zalo-account-assignment.service';

@Module({
  controllers: [ConversationsController],
  providers: [ConversationsService, ZaloAccountAssignmentService],
  exports: [ConversationsService, ZaloAccountAssignmentService]
})
export class ConversationsModule {}
