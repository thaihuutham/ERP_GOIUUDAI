import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SearchModule } from '../search/search.module';
import { CrmContractsService } from './crm-contracts.service';
import { CrmController } from './crm.controller';
import { CrmRenewalReminderSchedulerService } from './crm-renewal-reminder-scheduler.service';
import { CrmService } from './crm.service';

@Module({
  imports: [SearchModule, IamModule, NotificationsModule],
  controllers: [CrmController],
  providers: [CrmService, CrmContractsService, CrmRenewalReminderSchedulerService],
  exports: [CrmContractsService]
})
export class CrmModule {}
