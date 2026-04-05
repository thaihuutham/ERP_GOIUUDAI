import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module';
import { SettingsModule } from '../settings/settings.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [SettingsModule, IamModule],
  controllers: [FinanceController],
  providers: [FinanceService]
})
export class FinanceModule {}
