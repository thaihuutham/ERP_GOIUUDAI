import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { IamAccessService } from './iam-access.service';
import { IamScopeService } from './iam-scope.service';
import { IamCeilingService } from './iam-ceiling.service';
import { IamShadowLogService } from './iam-shadow-log.service';
import { IamScopeFilterService } from './iam-scope-filter.service';
import { IamShadowReportService } from './iam-shadow-report.service';

@Module({
  imports: [PrismaModule],
  providers: [
    IamAccessService,
    IamScopeService,
    IamCeilingService,
    IamShadowReportService,
    IamShadowLogService,
    IamScopeFilterService
  ],
  exports: [
    IamAccessService,
    IamScopeService,
    IamCeilingService,
    IamShadowReportService,
    IamShadowLogService,
    IamScopeFilterService
  ]
})
export class IamModule {}
