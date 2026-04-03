import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { SettingsModule } from '../settings/settings.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [SearchModule, SettingsModule, WorkflowsModule],
  controllers: [SalesController],
  providers: [SalesService]
})
export class SalesModule {}
