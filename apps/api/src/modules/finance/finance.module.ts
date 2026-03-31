import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [SettingsModule],
  controllers: [FinanceController],
  providers: [FinanceService]
})
export class FinanceModule {}
