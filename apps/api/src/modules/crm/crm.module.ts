import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module';
import { SearchModule } from '../search/search.module';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';

@Module({
  imports: [SearchModule, IamModule],
  controllers: [CrmController],
  providers: [CrmService]
})
export class CrmModule {}
