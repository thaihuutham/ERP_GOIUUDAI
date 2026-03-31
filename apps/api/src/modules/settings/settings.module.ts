import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { AuditModule } from '../audit/audit.module';
import { SettingsPolicyService } from './settings-policy.service';
import { SettingsController } from './settings.controller';
import { SettingsEnterpriseService } from './settings-enterprise.service';
import { SettingsMaintenanceSchedulerService } from './settings-maintenance-scheduler.service';
import { SettingsService } from './settings.service';

@Module({
  imports: [SearchModule, AuditModule],
  controllers: [SettingsController],
  providers: [SettingsService, SettingsPolicyService, SettingsEnterpriseService, SettingsMaintenanceSchedulerService],
  exports: [SettingsPolicyService, SettingsEnterpriseService]
})
export class SettingsModule {}
