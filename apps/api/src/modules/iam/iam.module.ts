import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { IamAccessService } from './iam-access.service';
import { IamScopeService } from './iam-scope.service';
import { IamCeilingService } from './iam-ceiling.service';
import { IamShadowLogService } from './iam-shadow-log.service';

@Module({
  imports: [PrismaModule],
  providers: [IamAccessService, IamScopeService, IamCeilingService, IamShadowLogService],
  exports: [IamAccessService, IamScopeService, IamCeilingService, IamShadowLogService]
})
export class IamModule {}
