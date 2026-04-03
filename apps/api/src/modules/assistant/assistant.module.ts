import { Module } from '@nestjs/common';
import { AssistantAuthzService } from './assistant-authz.service';
import { AssistantController } from './assistant.controller';
import { AssistantDispatchService } from './assistant-dispatch.service';
import { AssistantKnowledgeService } from './assistant-knowledge.service';
import { AssistantProxyService } from './assistant-proxy.service';
import { AssistantReportsService } from './assistant-reports.service';

@Module({
  controllers: [AssistantController],
  providers: [
    AssistantAuthzService,
    AssistantProxyService,
    AssistantKnowledgeService,
    AssistantDispatchService,
    AssistantReportsService
  ],
  exports: [AssistantAuthzService]
})
export class AssistantModule {}
