import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module';
import { SearchModule } from '../search/search.module';
import { SettingsModule } from '../settings/settings.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [SearchModule, SettingsModule, WorkflowsModule, IamModule],
  controllers: [SalesController],
  providers: [SalesService]
})
export class SalesModule {}
