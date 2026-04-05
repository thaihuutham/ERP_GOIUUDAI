import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module';
import { SearchModule } from '../search/search.module';
import { WorkflowsController } from './workflows.controller';
import { WorkflowEscalationSchedulerService } from './workflow-escalation-scheduler.service';
import { WorkflowsService } from './workflows.service';

@Module({
  imports: [SearchModule, IamModule],
  controllers: [WorkflowsController],
  providers: [WorkflowsService, WorkflowEscalationSchedulerService],
  exports: [WorkflowsService]
})
export class WorkflowsModule {}
