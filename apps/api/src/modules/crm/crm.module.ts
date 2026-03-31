import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';

@Module({
  imports: [SearchModule],
  controllers: [CrmController],
  providers: [CrmService]
})
export class CrmModule {}
