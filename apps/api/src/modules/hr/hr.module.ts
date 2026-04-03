import { Module } from '@nestjs/common';
import { HrController } from './hr.controller';
import { HrRegulationSchedulerService } from './hr-regulation-scheduler.service';
import { HrRegulationController } from './hr-regulation.controller';
import { HrRegulationService } from './hr-regulation.service';
import { HrService } from './hr.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkflowsModule } from '../workflows/workflows.module';

@Module({
  imports: [WorkflowsModule, NotificationsModule],
  controllers: [HrController, HrRegulationController],
  providers: [HrService, HrRegulationService, HrRegulationSchedulerService]
})
export class HrModule {}
