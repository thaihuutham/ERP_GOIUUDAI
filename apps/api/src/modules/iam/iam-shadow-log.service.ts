import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';
import { IamShadowReportService } from './iam-shadow-report.service';

export type IamShadowLogPayload = {
  tenantId: string;
  userId: string;
  moduleKey: string;
  action: PermissionAction;
  path: string;
  legacyAllowed: boolean;
  iamAllowed: boolean;
  mode: 'SHADOW' | 'ENFORCE';
  reasonLegacy: string;
  reasonIam: string;
};

@Injectable()
export class IamShadowLogService {
  private readonly logger = new Logger(IamShadowLogService.name);

  constructor(
    @Optional() @Inject(IamShadowReportService) private readonly shadowReport?: IamShadowReportService
  ) {}

  logLegacyVsIam(payload: IamShadowLogPayload) {
    const mismatch = payload.legacyAllowed !== payload.iamAllowed;
    if (!mismatch) {
      return;
    }

    this.shadowReport?.recordMismatch(payload);

    this.logger.warn(
      `iam-v2-shadow-mismatch tenant=${payload.tenantId} user=${payload.userId} module=${payload.moduleKey} action=${payload.action} legacy=${payload.legacyAllowed ? 'ALLOW' : 'DENY'} iam=${payload.iamAllowed ? 'ALLOW' : 'DENY'} mode=${payload.mode} path=${payload.path} legacyReason=${payload.reasonLegacy} iamReason=${payload.reasonIam}`
    );
  }
}
