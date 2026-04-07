import { Module } from '@nestjs/common';
import { CrmModule } from '../crm/crm.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { ZaloAccountAssignmentService } from '../zalo/zalo-account-assignment.service';
import { ZaloAutomationRealtimeModule } from '../zalo/zalo-automation-realtime.module';

@Module({
  imports: [ZaloAutomationRealtimeModule, CrmModule],
  controllers: [ConversationsController],
  providers: [ConversationsService, ZaloAccountAssignmentService],
  exports: [ConversationsService, ZaloAccountAssignmentService]
})
export class ConversationsModule {}
