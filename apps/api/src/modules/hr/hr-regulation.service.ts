import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GenericStatus,
  HrAppendixCode,
  HrAppendixRevisionStatus,
  HrAppendixSubmissionStatus,
  HrDailyScoreStatus,
  HrPipCaseStatus,
  Prisma,
  UserRole
} from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { AuthUser } from '../../common/auth/auth-user.type';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AUTH_USER_CONTEXT_KEY } from '../../common/request/request.constants';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WorkflowsService } from '../workflows/workflows.service';

type HrPayload = Record<string, unknown>;

type RoleTemplateRuntime = {
  roleGroup: string;
  pillarWeights: {
    output: number;
    activity: number;
    compliance: number;
    quality: number;
  };
  thresholds: {
    pipMonthlyScoreBelow: number;
    pipConsecutiveMonths: number;
    missingLogs30d: number;
  };
};

type RegulationScope = 'self' | 'team' | 'department' | 'company';

type RegulationAccessContext = {
  scope: RegulationScope;
  role: UserRole | 'ANONYMOUS';
  requesterEmployeeId: string | null;
  allowedEmployeeIds: string[] | null;
  canOverrideEmployeeId: boolean;
};

type AppendixFieldType = 'text' | 'number' | 'date' | 'select' | 'boolean';
type AppendixFieldAggregator = 'none' | 'count' | 'sum' | 'avg' | 'min' | 'max';
type AppendixFieldStatus = 'ACTIVE' | 'DRAFT' | 'INACTIVE' | 'ARCHIVED';

type AppendixFieldCatalogItemRuntime = {
  id: string;
  key: string;
  label: string;
  description: string;
  type: AppendixFieldType;
  options: string[];
  validation: Record<string, unknown>;
  analyticsEnabled: boolean;
  aggregator: AppendixFieldAggregator;
  status: AppendixFieldStatus;
  version: number;
};

type AppendixTemplateFieldRuntime = AppendixFieldCatalogItemRuntime & {
  required: boolean;
  placeholder: string;
  defaultValue: unknown;
  helpText: string;
  visibility: 'visible' | 'hidden';
  kpiAlias: string;
  source: 'global' | 'appendix-local';
};

type AppendixCatalogItemRuntime = {
  code: string;
  name: string;
  description: string;
  fields: AppendixTemplateFieldRuntime[];
};

const TZ_OFFSET_MINUTES = 7 * 60;
const APPROVAL_REQUIRED_CODES = new Set<HrAppendixCode>([
  HrAppendixCode.PL04,
  HrAppendixCode.PL05,
  HrAppendixCode.PL06,
  HrAppendixCode.PL10
]);
const DAILY_REQUIRED_CODES: HrAppendixCode[] = [HrAppendixCode.PL01, HrAppendixCode.PL02];
const APPENDIX_CODE_VALUES = Object.values(HrAppendixCode) as string[];
const APPENDIX_FIELD_TYPES: AppendixFieldType[] = ['text', 'number', 'date', 'select', 'boolean'];
const APPENDIX_FIELD_AGGREGATORS: AppendixFieldAggregator[] = ['none', 'count', 'sum', 'avg', 'min', 'max'];
const APPENDIX_FIELD_STATUSES: AppendixFieldStatus[] = ['ACTIVE', 'DRAFT', 'INACTIVE', 'ARCHIVED'];

const DEFAULT_ROLE_TEMPLATES: Record<string, RoleTemplateRuntime> = {
  SALES: {
    roleGroup: 'SALES',
    pillarWeights: { output: 50, activity: 20, compliance: 20, quality: 10 },
    thresholds: { pipMonthlyScoreBelow: 75, pipConsecutiveMonths: 2, missingLogs30d: 5 }
  },
  MARKETING: {
    roleGroup: 'MARKETING',
    pillarWeights: { output: 45, activity: 25, compliance: 20, quality: 10 },
    thresholds: { pipMonthlyScoreBelow: 75, pipConsecutiveMonths: 2, missingLogs30d: 5 }
  },
  HCNS: {
    roleGroup: 'HCNS',
    pillarWeights: { output: 35, activity: 20, compliance: 35, quality: 10 },
    thresholds: { pipMonthlyScoreBelow: 75, pipConsecutiveMonths: 2, missingLogs30d: 5 }
  },
  ACCOUNTING: {
    roleGroup: 'ACCOUNTING',
    pillarWeights: { output: 35, activity: 15, compliance: 40, quality: 10 },
    thresholds: { pipMonthlyScoreBelow: 75, pipConsecutiveMonths: 2, missingLogs30d: 5 }
  },
  GENERAL: {
    roleGroup: 'GENERAL',
    pillarWeights: { output: 40, activity: 25, compliance: 25, quality: 10 },
    thresholds: { pipMonthlyScoreBelow: 75, pipConsecutiveMonths: 2, missingLogs30d: 5 }
  }
};

const DEFAULT_APPENDIX_FIELD_CATALOG: AppendixFieldCatalogItemRuntime[] = [
  {
    id: 'summary',
    key: 'summary',
    label: 'Tom tat cong viec',
    description: 'Noi dung tong hop cong viec da thuc hien.',
    type: 'text',
    options: [],
    validation: { required: true, maxLength: 1000 },
    analyticsEnabled: false,
    aggregator: 'none',
    status: 'ACTIVE',
    version: 1
  },
  {
    id: 'result',
    key: 'result',
    label: 'Ket qua',
    description: 'Ket qua dau ra cua cong viec.',
    type: 'text',
    options: [],
    validation: { required: true, maxLength: 1000 },
    analyticsEnabled: false,
    aggregator: 'none',
    status: 'ACTIVE',
    version: 1
  },
  {
    id: 'taskCount',
    key: 'taskCount',
    label: 'So dau viec hoan thanh',
    description: 'So luong dau viec da xu ly.',
    type: 'number',
    options: [],
    validation: { min: 0, max: 10000 },
    analyticsEnabled: true,
    aggregator: 'sum',
    status: 'ACTIVE',
    version: 1
  },
  {
    id: 'complianceNote',
    key: 'complianceNote',
    label: 'Ghi chu tuan thu',
    description: 'Ghi nhan tuan thu quy trinh/han muc.',
    type: 'text',
    options: [],
    validation: { maxLength: 1000 },
    analyticsEnabled: false,
    aggregator: 'none',
    status: 'ACTIVE',
    version: 1
  },
  {
    id: 'qualityNote',
    key: 'qualityNote',
    label: 'Ghi chu chat luong',
    description: 'Danh gia chat luong ket qua cong viec.',
    type: 'text',
    options: [],
    validation: { maxLength: 1000 },
    analyticsEnabled: false,
    aggregator: 'none',
    status: 'ACTIVE',
    version: 1
  },
  {
    id: 'note',
    key: 'note',
    label: 'Ghi chu bo sung',
    description: 'Thong tin mo rong khac.',
    type: 'text',
    options: [],
    validation: { maxLength: 2000 },
    analyticsEnabled: false,
    aggregator: 'none',
    status: 'ACTIVE',
    version: 1
  }
];

const DEFAULT_APPENDIX_TEMPLATE_FIELDS: Record<string, Array<Record<string, unknown>>> = {
  PL01: [
    { fieldKey: 'summary', required: true, helpText: 'Tom tat cong viec ngay.' },
    { fieldKey: 'result', required: true, helpText: 'Ket qua chinh cua cong viec.' },
    { fieldKey: 'taskCount', required: false, helpText: 'Nhap so dau viec hoan thanh.' },
    { fieldKey: 'complianceNote', required: false },
    { fieldKey: 'note', required: false }
  ],
  PL02: [
    { fieldKey: 'summary', required: true },
    { fieldKey: 'result', required: true },
    { fieldKey: 'taskCount', required: false },
    { fieldKey: 'qualityNote', required: false },
    { fieldKey: 'note', required: false }
  ],
  PL03: [
    { fieldKey: 'summary', required: true },
    { fieldKey: 'result', required: true },
    { fieldKey: 'qualityNote', required: false },
    { fieldKey: 'note', required: false }
  ],
  PL04: [
    { fieldKey: 'summary', required: true },
    { fieldKey: 'result', required: true },
    { fieldKey: 'complianceNote', required: false },
    { fieldKey: 'qualityNote', required: false },
    { fieldKey: 'note', required: false }
  ],
  PL05: [
    { fieldKey: 'summary', required: true },
    { fieldKey: 'result', required: true },
    { fieldKey: 'taskCount', required: false },
    { fieldKey: 'complianceNote', required: false },
    { fieldKey: 'note', required: false }
  ],
  PL06: [
    { fieldKey: 'summary', required: true },
    { fieldKey: 'result', required: true },
    { fieldKey: 'taskCount', required: false },
    { fieldKey: 'qualityNote', required: false },
    { fieldKey: 'note', required: false }
  ],
  PL10: [
    { fieldKey: 'summary', required: true },
    { fieldKey: 'result', required: true },
    { fieldKey: 'complianceNote', required: false },
    { fieldKey: 'qualityNote', required: false },
    { fieldKey: 'note', required: false }
  ]
};

const DEFAULT_APPENDIX_TEMPLATE_META: Record<string, { name: string; description: string }> = {
  PL01: {
    name: 'Phu luc nhat ky cong viec ngay',
    description: 'Ghi nhan hoat dong trong ngay theo quy che 2026.'
  },
  PL02: {
    name: 'Phu luc ket qua cong viec ngay',
    description: 'Tong hop ket qua va chat luong thuc thi trong ngay.'
  },
  PL03: {
    name: 'Phu luc bao cao theo yeu cau',
    description: 'Bao cao bo sung theo yeu cau quan ly truc tiep.'
  },
  PL04: {
    name: 'Phu luc tuan thu quy trinh',
    description: 'Theo doi viec tuan thu va cac sai lech can khac phuc.'
  },
  PL05: {
    name: 'Phu luc phoi hop lien phong ban',
    description: 'Ghi nhan tien do phoi hop voi don vi lien quan.'
  },
  PL06: {
    name: 'Phu luc cai tien chat luong',
    description: 'Theo doi de xuat cai tien va ket qua trien khai.'
  },
  PL10: {
    name: 'Phu luc ke hoach cai thien hieu suat (PIP)',
    description: 'Dung cho truong hop can theo doi cai thien hieu suat.'
  }
};

@Injectable()
export class HrRegulationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(ConfigService) private readonly config?: ConfigService,
    @Optional() @Inject(ClsService) private readonly cls?: ClsService,
    @Optional() @Inject(RuntimeSettingsService) private readonly runtimeSettings?: RuntimeSettingsService,
    @Optional() @Inject(WorkflowsService) private readonly workflowsService?: WorkflowsService,
    @Optional() @Inject(NotificationsService) private readonly notificationsService?: NotificationsService
  ) {}

  async getRegulationMetadata() {
    const access = await this.resolveRegulationAccessContext();
    const appendixRuntime = await this.getAppendixRuntime();
    return {
      viewerScope: access.scope,
      canOverrideEmployeeId: access.canOverrideEmployeeId,
      requesterEmployeeId: access.requesterEmployeeId,
      fieldCatalog: appendixRuntime.fieldCatalog,
      appendices: appendixRuntime.appendices
    };
  }

  async listAppendixTemplates(query: PaginationQueryDto, appendixCode?: string, status?: string) {
    const where: Prisma.HrAppendixTemplateWhereInput = {};
    const normalizedCode = this.toAppendixCode(appendixCode, null);
    if (normalizedCode) {
      where.appendixCode = normalizedCode;
    }
    const normalizedStatus = this.toGenericStatus(status, null);
    if (normalizedStatus) {
      where.status = normalizedStatus;
    }

    return this.prisma.client.hrAppendixTemplate.findMany({
      where,
      orderBy: [{ appendixCode: 'asc' }, { version: 'desc' }, { createdAt: 'desc' }],
      take: this.take(query.limit, 300)
    });
  }

  async patchAppendixTemplate(payload: HrPayload) {
    const id = this.readString(payload.id, null);
    if (!id) {
      throw new BadRequestException('Thiếu id template.');
    }

    const existing = await this.prisma.client.hrAppendixTemplate.findFirst({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy appendix template: ${id}`);
    }

    const appendixCode = this.toAppendixCode(payload.appendixCode, existing.appendixCode) ?? existing.appendixCode;
    const version = this.toInt(payload.version, Number(existing.version), 1, 1000);

    await this.prisma.client.hrAppendixTemplate.updateMany({
      where: { id },
      data: {
        appendixCode,
        version,
        formSchemaJson: payload.formSchemaJson !== undefined ? this.toNullableInputJson(payload.formSchemaJson) : undefined,
        activeRulesJson: payload.activeRulesJson !== undefined ? this.toNullableInputJson(payload.activeRulesJson) : undefined,
        status: this.toGenericStatus(payload.status, existing.status) ?? existing.status,
        updatedBy: this.readString(payload.updatedBy ?? payload.actorId, existing.updatedBy ?? null)
      }
    });

    return this.prisma.client.hrAppendixTemplate.findFirst({ where: { id } });
  }

  async listAppendixSubmissions(query: PaginationQueryDto, filters: HrPayload = {}) {
    const access = await this.resolveRegulationAccessContext();
    const where: Prisma.HrAppendixSubmissionWhereInput = {};

    const appendixCode = this.toAppendixCode(filters.appendixCode ?? filters.code, null);
    if (appendixCode) {
      where.appendixCode = appendixCode;
    }

    const employeeId = this.readString(filters.employeeId, null);
    if (employeeId) {
      this.assertEmployeeIdReadable(access, employeeId);
      where.employeeId = employeeId;
    }

    const status = this.toAppendixSubmissionStatus(filters.status, null);
    if (status) {
      where.status = status;
    }

    const period = this.readString(filters.period, null);
    if (period) {
      where.period = period;
    }

    const workDate = this.toWorkDate(filters.workDate ?? filters.date, null);
    if (workDate) {
      const { startUtc, endUtc } = this.dayRangeUtcByIct(workDate);
      where.workDate = {
        gte: startUtc,
        lt: endUtc
      };
    }

    this.applyEmployeeScope(where, access);

    const items = await this.prisma.client.hrAppendixSubmission.findMany({
      where,
      include: {
        template: true,
        evidences: true,
        revisions: {
          orderBy: { createdAt: 'desc' },
          take: 20
        }
      },
      orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
      take: this.take(query.limit, 300)
    });

    return {
      viewerScope: access.scope,
      items
    };
  }

  async createAppendixSubmission(payload: HrPayload) {
    const access = await this.resolveRegulationAccessContext();
    const appendixCode = this.requireAppendixCode(payload.appendixCode ?? payload.code);
    const appendixRuntime = await this.getAppendixRuntime();
    const appendixDefinition = this.findAppendixDefinition(appendixRuntime.appendices, appendixCode);
    const employeeId = this.resolveWritableEmployeeId(
      access,
      this.readString(payload.employeeId, null)
    );
    if (!employeeId) {
      throw new BadRequestException('Thiếu employeeId.');
    }
    await this.ensureEmployee(employeeId);

    const workDate = this.toWorkDate(payload.workDate, null);
    const templateId = this.readString(payload.templateId, null);
    const dueAt = this.toDate(payload.dueAt, null) ?? this.computeDefaultDueAt(appendixCode, workDate);
    const normalizedPayload = this.normalizeSubmissionPayload(
      appendixDefinition,
      payload.payloadJson ?? payload.payload ?? {}
    );

    const submission = await this.prisma.client.hrAppendixSubmission.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        appendixCode,
        templateId,
        employeeId,
        workDate,
        period: this.readString(payload.period, null),
        payloadJson: this.toNullableInputJson(normalizedPayload),
        status: this.toAppendixSubmissionStatus(payload.status, HrAppendixSubmissionStatus.DRAFT) ?? HrAppendixSubmissionStatus.DRAFT,
        dueAt,
        createdBy: this.readString(payload.createdBy ?? payload.actorId, null),
        updatedBy: this.readString(payload.updatedBy ?? payload.actorId, null)
      }
    });

    await this.replaceSubmissionEvidences(submission.id, payload.evidences, false);

    return this.prisma.client.hrAppendixSubmission.findFirst({
      where: { id: submission.id },
      include: {
        template: true,
        evidences: true,
        revisions: {
          orderBy: { createdAt: 'desc' },
          take: 20
        }
      }
    });
  }

  async patchAppendixSubmission(id: string, payload: HrPayload) {
    const submission = await this.ensureAppendixSubmission(id);
    const access = await this.resolveRegulationAccessContext();
    this.assertEmployeeIdWritable(access, submission.employeeId);

    if (submission.status !== HrAppendixSubmissionStatus.DRAFT) {
      throw new BadRequestException('Chỉ cho phép chỉnh bản nháp (DRAFT).');
    }

    const appendixCode = this.toAppendixCode(payload.appendixCode ?? payload.code, submission.appendixCode) ?? submission.appendixCode;
    const appendixRuntime = await this.getAppendixRuntime();
    const appendixDefinition = this.findAppendixDefinition(appendixRuntime.appendices, appendixCode);
    const employeeId = this.resolveWritableEmployeeId(
      access,
      this.readString(payload.employeeId, submission.employeeId),
      submission.employeeId
    );
    if (!employeeId) {
      throw new BadRequestException('Thiếu employeeId.');
    }

    const workDate = payload.workDate !== undefined
      ? this.toWorkDate(payload.workDate, null)
      : submission.workDate;
    const dueAt = payload.dueAt !== undefined
      ? this.toDate(payload.dueAt, null)
      : (submission.dueAt ?? this.computeDefaultDueAt(appendixCode, workDate));
    const shouldUpdatePayload = payload.payloadJson !== undefined || payload.payload !== undefined;
    const normalizedPayload = shouldUpdatePayload
      ? this.normalizeSubmissionPayload(appendixDefinition, payload.payloadJson ?? payload.payload)
      : null;

    await this.prisma.client.hrAppendixSubmission.updateMany({
      where: { id },
      data: {
        appendixCode,
        templateId: payload.templateId !== undefined ? this.readString(payload.templateId, null) : undefined,
        employeeId,
        workDate,
        period: payload.period !== undefined ? this.readString(payload.period, null) : undefined,
        payloadJson: shouldUpdatePayload ? this.toNullableInputJson(normalizedPayload) : undefined,
        dueAt,
        updatedBy: this.readString(payload.updatedBy ?? payload.actorId, submission.updatedBy ?? null)
      }
    });

    if (payload.evidences !== undefined) {
      await this.replaceSubmissionEvidences(id, payload.evidences, true);
    }

    return this.prisma.client.hrAppendixSubmission.findFirst({
      where: { id },
      include: {
        template: true,
        evidences: true,
        revisions: {
          orderBy: { createdAt: 'desc' },
          take: 20
        }
      }
    });
  }

  async submitAppendixSubmission(id: string, payload: HrPayload) {
    const submission = await this.ensureAppendixSubmission(id);
    const access = await this.resolveRegulationAccessContext();
    this.assertEmployeeIdWritable(access, submission.employeeId);
    if (submission.status === HrAppendixSubmissionStatus.APPROVED) {
      return submission;
    }

    const now = new Date();
    const actorId = this.readString(payload.actorId ?? payload.requestedBy, submission.employeeId) ?? submission.employeeId;
    const approver = await this.resolveSubmissionApprover(submission.employeeId);
    const isApprovalRequired = APPROVAL_REQUIRED_CODES.has(submission.appendixCode);

    await this.prisma.client.hrAppendixSubmission.updateMany({
      where: { id },
      data: {
        status: isApprovalRequired ? HrAppendixSubmissionStatus.SUBMITTED : HrAppendixSubmissionStatus.APPROVED,
        submittedAt: now,
        decidedAt: isApprovalRequired ? null : now,
        approverId: approver.approverId,
        updatedBy: actorId
      }
    });

    if (isApprovalRequired) {
      await this.createApprovalTask({
        targetType: 'HR_APPENDIX_SUBMISSION',
        targetId: id,
        requesterId: actorId,
        approverId: approver.approverId,
        dueAt: submission.dueAt,
        contextJson: {
          appendixCode: submission.appendixCode,
          employeeId: submission.employeeId,
          workDate: submission.workDate?.toISOString() ?? null,
          period: submission.period ?? null
        }
      });

      await this.pushNotification(approver.approverId, {
        title: `Cần duyệt phụ lục ${submission.appendixCode}`,
        content: `Yêu cầu duyệt ${submission.appendixCode} của nhân sự ${submission.employeeId}.`
      });
    }

    await this.recomputeDailyScoreBySubmission(id, 'submission-submit');

    return this.ensureAppendixSubmission(id);
  }

  async approveAppendixSubmission(id: string, payload: HrPayload) {
    const submission = await this.ensureAppendixSubmission(id);
    const access = await this.resolveRegulationAccessContext();
    this.assertEmployeeIdReadable(access, submission.employeeId);
    const approverId = this.readString(payload.approverId ?? payload.actorId, null);
    if (!approverId) {
      throw new BadRequestException('Thiếu approverId.');
    }

    const now = new Date();
    await this.prisma.client.hrAppendixSubmission.updateMany({
      where: { id },
      data: {
        status: HrAppendixSubmissionStatus.APPROVED,
        decidedAt: now,
        approverId,
        decisionNote: this.readString(payload.note ?? payload.decisionNote, null),
        updatedBy: approverId
      }
    });

    await this.closeApprovalTasks('HR_APPENDIX_SUBMISSION', id, GenericStatus.APPROVED, approverId, payload.note);
    await this.recomputeDailyScoreBySubmission(id, 'submission-approve');

    return this.ensureAppendixSubmission(id);
  }

  async rejectAppendixSubmission(id: string, payload: HrPayload) {
    const submission = await this.ensureAppendixSubmission(id);
    const access = await this.resolveRegulationAccessContext();
    this.assertEmployeeIdReadable(access, submission.employeeId);
    const approverId = this.readString(payload.approverId ?? payload.actorId, null);
    if (!approverId) {
      throw new BadRequestException('Thiếu approverId.');
    }

    const now = new Date();
    await this.prisma.client.hrAppendixSubmission.updateMany({
      where: { id },
      data: {
        status: HrAppendixSubmissionStatus.REJECTED,
        decidedAt: now,
        approverId,
        decisionNote: this.readString(payload.note ?? payload.decisionNote, null),
        updatedBy: approverId
      }
    });

    await this.closeApprovalTasks('HR_APPENDIX_SUBMISSION', id, GenericStatus.REJECTED, approverId, payload.note);
    await this.recomputeDailyScoreBySubmission(id, 'submission-reject');

    return this.ensureAppendixSubmission(id);
  }

  async createAppendixRevision(submissionId: string, payload: HrPayload) {
    const submission = await this.ensureAppendixSubmission(submissionId);
    const access = await this.resolveRegulationAccessContext();
    this.assertEmployeeIdWritable(access, submission.employeeId);
    if (!submission.workDate) {
      throw new BadRequestException('Submission không có workDate để áp dụng revision T+1.');
    }

    if (!this.isWithinTPlusOneWindow(submission.workDate, new Date())) {
      throw new BadRequestException('Đã quá cửa sổ chỉnh sửa T+1 (23:59 ngày kế tiếp).');
    }

    const revisionPayload = payload.payloadJson ?? payload.payload;
    if (!revisionPayload || typeof revisionPayload !== 'object' || Array.isArray(revisionPayload)) {
      throw new BadRequestException('Revision payload không hợp lệ.');
    }

    const requestedBy = this.readString(payload.requestedBy ?? payload.actorId, submission.employeeId) ?? submission.employeeId;
    const approver = await this.resolveSubmissionApprover(submission.employeeId);

    const revision = await this.prisma.client.hrAppendixRevision.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        submissionId,
        requestedBy,
        payloadJson: this.toNullableInputJson(revisionPayload),
        reason: this.readString(payload.reason, null),
        status: HrAppendixRevisionStatus.PENDING_APPROVAL,
        approverId: approver.approverId
      }
    });

    await this.createApprovalTask({
      targetType: 'HR_APPENDIX_REVISION',
      targetId: revision.id,
      requesterId: requestedBy,
      approverId: approver.approverId,
      dueAt: this.freezeDeadlineByWorkDate(submission.workDate),
      contextJson: {
        submissionId,
        appendixCode: submission.appendixCode,
        employeeId: submission.employeeId,
        workDate: submission.workDate.toISOString()
      }
    });

    await this.pushNotification(approver.approverId, {
      title: `Cần duyệt chỉnh sửa T+1 ${submission.appendixCode}`,
      content: `Nhân sự ${submission.employeeId} vừa gửi yêu cầu chỉnh sửa T+1.`
    });

    return this.prisma.client.hrAppendixRevision.findFirst({ where: { id: revision.id } });
  }

  async approveAppendixRevision(id: string, payload: HrPayload) {
    const revision = await this.ensureAppendixRevision(id);
    if (revision.status !== HrAppendixRevisionStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Revision không còn ở trạng thái chờ duyệt.');
    }

    const submission = await this.ensureAppendixSubmission(revision.submissionId);
    const access = await this.resolveRegulationAccessContext();
    this.assertEmployeeIdReadable(access, submission.employeeId);
    if (!submission.workDate) {
      throw new BadRequestException('Submission không có workDate để áp dụng revision.');
    }
    const approverId = this.readString(payload.approverId ?? payload.actorId, null);
    if (!approverId) {
      throw new BadRequestException('Thiếu approverId.');
    }

    const now = new Date();
    await this.prisma.client.hrAppendixSubmission.updateMany({
      where: { id: submission.id },
      data: {
        payloadJson: revision.payloadJson as Prisma.InputJsonValue,
        status: HrAppendixSubmissionStatus.APPROVED,
        decidedAt: now,
        approverId,
        updatedBy: approverId
      }
    });

    await this.prisma.client.hrAppendixRevision.updateMany({
      where: { id },
      data: {
        status: HrAppendixRevisionStatus.APPROVED,
        approvedAt: now,
        appliedAt: now,
        decisionNote: this.readString(payload.note ?? payload.decisionNote, null),
        approverId
      }
    });

    await this.closeApprovalTasks('HR_APPENDIX_REVISION', id, GenericStatus.APPROVED, approverId, payload.note);
    await this.recomputeDailyScore(submission.employeeId, submission.workDate, 'revision-approve');

    return this.ensureAppendixRevision(id);
  }

  async rejectAppendixRevision(id: string, payload: HrPayload) {
    const revision = await this.ensureAppendixRevision(id);
    if (revision.status !== HrAppendixRevisionStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Revision không còn ở trạng thái chờ duyệt.');
    }

    const submission = await this.ensureAppendixSubmission(revision.submissionId);
    const access = await this.resolveRegulationAccessContext();
    this.assertEmployeeIdReadable(access, submission.employeeId);

    const approverId = this.readString(payload.approverId ?? payload.actorId, null);
    if (!approverId) {
      throw new BadRequestException('Thiếu approverId.');
    }

    const now = new Date();
    await this.prisma.client.hrAppendixRevision.updateMany({
      where: { id },
      data: {
        status: HrAppendixRevisionStatus.REJECTED,
        rejectedAt: now,
        decisionNote: this.readString(payload.note ?? payload.decisionNote, null),
        approverId
      }
    });

    await this.closeApprovalTasks('HR_APPENDIX_REVISION', id, GenericStatus.REJECTED, approverId, payload.note);
    return this.ensureAppendixRevision(id);
  }

  async listDailyScores(query: PaginationQueryDto, filters: HrPayload = {}) {
    const access = await this.resolveRegulationAccessContext();
    const where: Prisma.HrDailyScoreSnapshotWhereInput = {};
    const employeeId = this.readString(filters.employeeId, null);
    if (employeeId) {
      this.assertEmployeeIdReadable(access, employeeId);
      where.employeeId = employeeId;
    }

    const status = this.toDailyScoreStatus(filters.status, null);
    if (status) {
      where.status = status;
    }

    const fromDate = this.toWorkDate(filters.fromDate ?? filters.from, null);
    const toDate = this.toWorkDate(filters.toDate ?? filters.to, null);
    if (fromDate || toDate) {
      where.workDate = {
        ...(fromDate ? { gte: this.dayRangeUtcByIct(fromDate).startUtc } : {}),
        ...(toDate ? { lt: this.dayRangeUtcByIct(this.addIctDays(toDate, 1)).startUtc } : {})
      };
    }

    this.applyEmployeeScope(where, access);

    const items = await this.prisma.client.hrDailyScoreSnapshot.findMany({
      where,
      orderBy: [{ workDate: 'desc' }, { employeeId: 'asc' }],
      take: this.take(query.limit, 500)
    });

    return {
      viewerScope: access.scope,
      items
    };
  }

  async listScoreRoleTemplates() {
    const custom = await this.prisma.client.hrScoreRoleTemplate.findMany({
      where: {
        status: { in: [GenericStatus.ACTIVE, GenericStatus.DRAFT] }
      },
      orderBy: { roleGroup: 'asc' }
    });

    const customMap = new Map(custom.map((item) => [item.roleGroup.toUpperCase(), item]));

    const payload: Array<Record<string, unknown>> = [];
    for (const key of Object.keys(DEFAULT_ROLE_TEMPLATES)) {
      const existing = customMap.get(key);
      const defaults = DEFAULT_ROLE_TEMPLATES[key];
      payload.push({
        id: existing?.id ?? null,
        roleGroup: key,
        pillarWeights: this.toJsonObject(existing?.pillarWeights) ?? defaults.pillarWeights,
        thresholds: this.toJsonObject(existing?.thresholds) ?? defaults.thresholds,
        status: existing?.status ?? GenericStatus.ACTIVE,
        source: existing ? 'custom' : 'default'
      });
    }

    for (const item of custom) {
      const key = item.roleGroup.toUpperCase();
      if (DEFAULT_ROLE_TEMPLATES[key]) {
        continue;
      }
      payload.push({
        id: item.id,
        roleGroup: item.roleGroup,
        pillarWeights: this.toJsonObject(item.pillarWeights),
        thresholds: this.toJsonObject(item.thresholds),
        status: item.status,
        source: 'custom'
      });
    }

    return payload;
  }

  async patchScoreRoleTemplate(roleGroup: string, payload: HrPayload) {
    const normalizedRoleGroup = this.readString(roleGroup, null)?.toUpperCase();
    if (!normalizedRoleGroup) {
      throw new BadRequestException('Thiếu roleGroup.');
    }

    const existing = await this.prisma.client.hrScoreRoleTemplate.findFirst({
      where: {
        roleGroup: normalizedRoleGroup
      }
    });

    const weightsInput = this.toJsonObject(payload.pillarWeights);
    const thresholdsInput = this.toJsonObject(payload.thresholds);
    const fallback = DEFAULT_ROLE_TEMPLATES[normalizedRoleGroup] ?? DEFAULT_ROLE_TEMPLATES.GENERAL;

    const normalizedWeights = this.normalizePillarWeights({
      output: this.toNumber(weightsInput.output) ?? fallback.pillarWeights.output,
      activity: this.toNumber(weightsInput.activity) ?? fallback.pillarWeights.activity,
      compliance: this.toNumber(weightsInput.compliance) ?? fallback.pillarWeights.compliance,
      quality: this.toNumber(weightsInput.quality) ?? fallback.pillarWeights.quality
    });

    const normalizedThresholds = {
      pipMonthlyScoreBelow: this.toNumber(thresholdsInput.pipMonthlyScoreBelow) ?? fallback.thresholds.pipMonthlyScoreBelow,
      pipConsecutiveMonths: this.toInt(thresholdsInput.pipConsecutiveMonths, fallback.thresholds.pipConsecutiveMonths, 1, 6),
      missingLogs30d: this.toInt(thresholdsInput.missingLogs30d, fallback.thresholds.missingLogs30d, 1, 60)
    };

    if (existing) {
      await this.prisma.client.hrScoreRoleTemplate.updateMany({
        where: { id: existing.id },
        data: {
          pillarWeights: this.toNullableInputJson(normalizedWeights),
          thresholds: this.toNullableInputJson(normalizedThresholds),
          status: this.toGenericStatus(payload.status, existing.status) ?? existing.status,
          updatedBy: this.readString(payload.updatedBy ?? payload.actorId, existing.updatedBy ?? null)
        }
      });
      return this.prisma.client.hrScoreRoleTemplate.findFirst({ where: { id: existing.id } });
    }

    return this.prisma.client.hrScoreRoleTemplate.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        roleGroup: normalizedRoleGroup,
        pillarWeights: this.toNullableInputJson(normalizedWeights),
        thresholds: this.toNullableInputJson(normalizedThresholds),
        status: this.toGenericStatus(payload.status, GenericStatus.ACTIVE) ?? GenericStatus.ACTIVE,
        createdBy: this.readString(payload.createdBy ?? payload.actorId, null),
        updatedBy: this.readString(payload.updatedBy ?? payload.actorId, null)
      }
    });
  }

  async recomputeDailyScores(payload: HrPayload = {}) {
    const employeeId = this.readString(payload.employeeId, null);
    const workDate = this.toWorkDate(payload.workDate, null);
    const limit = this.toInt(payload.limit, 200, 1, 2_000);

    if (employeeId && workDate) {
      const snapshot = await this.recomputeDailyScore(employeeId, workDate, 'manual-recompute');
      return {
        processed: 1,
        snapshots: [snapshot]
      };
    }

    const where: Prisma.HrAppendixSubmissionWhereInput = {
      workDate: { not: null }
    };

    if (employeeId) {
      where.employeeId = employeeId;
    }

    const fromDate = this.toWorkDate(payload.fromDate ?? payload.from, null);
    const toDate = this.toWorkDate(payload.toDate ?? payload.to, null);
    if (fromDate || toDate) {
      where.workDate = {
        ...(fromDate ? { gte: this.dayRangeUtcByIct(fromDate).startUtc } : {}),
        ...(toDate ? { lt: this.dayRangeUtcByIct(this.addIctDays(toDate, 1)).startUtc } : {})
      };
    }

    const records = await this.prisma.client.hrAppendixSubmission.findMany({
      where,
      select: {
        employeeId: true,
        workDate: true
      },
      orderBy: { updatedAt: 'desc' },
      take: limit
    });

    const dedupKeys = new Set<string>();
    const targets: Array<{ employeeId: string; workDate: Date }> = [];

    for (const row of records) {
      if (!row.workDate) continue;
      const dayKey = this.formatIctDateKey(row.workDate);
      const uniqueKey = `${row.employeeId}::${dayKey}`;
      if (dedupKeys.has(uniqueKey)) {
        continue;
      }
      dedupKeys.add(uniqueKey);
      targets.push({
        employeeId: row.employeeId,
        workDate: this.parseIctDateKey(dayKey)
      });
    }

    const snapshots: Array<Record<string, unknown>> = [];
    for (const target of targets) {
      const snapshot = await this.recomputeDailyScore(target.employeeId, target.workDate, 'manual-recompute-batch');
      snapshots.push(snapshot as unknown as Record<string, unknown>);
    }

    return {
      processed: snapshots.length,
      snapshots
    };
  }

  async reconcileDailyScores(payload: HrPayload = {}) {
    const limit = this.toInt(payload.limit, 200, 1, 2_000);
    const now = new Date();

    const recentSubmissions = await this.prisma.client.hrAppendixSubmission.findMany({
      where: {
        workDate: { not: null },
        updatedAt: {
          gte: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
        }
      },
      select: {
        employeeId: true,
        workDate: true
      },
      orderBy: { updatedAt: 'desc' },
      take: limit
    });

    const staleProvisional = await this.prisma.client.hrDailyScoreSnapshot.findMany({
      where: {
        status: HrDailyScoreStatus.PROVISIONAL,
        freezeAt: {
          lt: now
        }
      },
      select: {
        employeeId: true,
        workDate: true
      },
      orderBy: { workDate: 'asc' },
      take: limit
    });

    const targetSet = new Set<string>();
    const targets: Array<{ employeeId: string; workDate: Date }> = [];

    for (const row of [...recentSubmissions, ...staleProvisional]) {
      if (!row.workDate) continue;
      const dateKey = this.formatIctDateKey(row.workDate);
      const uniqueKey = `${row.employeeId}::${dateKey}`;
      if (targetSet.has(uniqueKey)) continue;
      targetSet.add(uniqueKey);
      targets.push({
        employeeId: row.employeeId,
        workDate: this.parseIctDateKey(dateKey)
      });
    }

    let processed = 0;
    let finalized = 0;

    for (const target of targets) {
      const snapshot = await this.recomputeDailyScore(target.employeeId, target.workDate, 'scheduler-reconcile');
      processed += 1;
      if (snapshot.status === HrDailyScoreStatus.FINAL) {
        finalized += 1;
      }
    }

    return {
      scanned: targets.length,
      processed,
      finalized,
      triggeredBy: this.readString(payload.triggeredBy, 'system-scheduler')
    };
  }

  async listPipCases(query: PaginationQueryDto, employeeId?: string, status?: string) {
    const access = await this.resolveRegulationAccessContext();
    const where: Prisma.HrPipCaseWhereInput = {};

    const normalizedEmployeeId = this.readString(employeeId, null);
    if (normalizedEmployeeId) {
      this.assertEmployeeIdReadable(access, normalizedEmployeeId);
      where.employeeId = normalizedEmployeeId;
    }

    const normalizedStatus = this.toPipStatus(status, null);
    if (normalizedStatus) {
      where.status = normalizedStatus;
    }

    this.applyEmployeeScope(where, access);

    const items = await this.prisma.client.hrPipCase.findMany({
      where,
      include: {
        sourceSubmission: {
          include: {
            evidences: true,
            revisions: {
              orderBy: { createdAt: 'desc' },
              take: 20
            }
          }
        }
      },
      orderBy: [{ createdAt: 'desc' }],
      take: this.take(query.limit, 300)
    });

    return {
      viewerScope: access.scope,
      items
    };
  }

  async createPipCase(payload: HrPayload) {
    const access = await this.resolveRegulationAccessContext();
    const employeeId = this.resolveWritableEmployeeId(
      access,
      this.readString(payload.employeeId, null)
    );
    if (!employeeId) {
      throw new BadRequestException('Thiếu employeeId.');
    }

    await this.ensureEmployee(employeeId);

    return this.prisma.client.hrPipCase.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        employeeId,
        sourceSubmissionId: this.readString(payload.sourceSubmissionId, null),
        triggerReason: this.readString(payload.triggerReason, 'manual') ?? 'manual',
        baselineJson: this.toNullableInputJson(payload.baselineJson ?? payload.baseline ?? {}),
        goalsJson: this.toNullableInputJson(payload.goalsJson ?? payload.goals ?? {}),
        status: this.toPipStatus(payload.status, HrPipCaseStatus.DRAFT) ?? HrPipCaseStatus.DRAFT,
        openedAt: this.toDate(payload.openedAt, null),
        closedAt: this.toDate(payload.closedAt, null),
        closedReason: this.readString(payload.closedReason, null),
        createdBy: this.readString(payload.createdBy ?? payload.actorId, null),
        updatedBy: this.readString(payload.updatedBy ?? payload.actorId, null)
      }
    });
  }

  async patchPipCase(id: string, payload: HrPayload) {
    const pipCase = await this.ensurePipCase(id);
    const access = await this.resolveRegulationAccessContext();
    this.assertEmployeeIdWritable(access, pipCase.employeeId);

    const status = this.toPipStatus(payload.status, pipCase.status) ?? pipCase.status;
    const now = new Date();

    await this.prisma.client.hrPipCase.updateMany({
      where: { id },
      data: {
        sourceSubmissionId: payload.sourceSubmissionId !== undefined ? this.readString(payload.sourceSubmissionId, null) : undefined,
        triggerReason: payload.triggerReason !== undefined ? (this.readString(payload.triggerReason, pipCase.triggerReason) ?? pipCase.triggerReason) : undefined,
        baselineJson: payload.baselineJson !== undefined || payload.baseline !== undefined
          ? this.toNullableInputJson(payload.baselineJson ?? payload.baseline)
          : undefined,
        goalsJson: payload.goalsJson !== undefined || payload.goals !== undefined
          ? this.toNullableInputJson(payload.goalsJson ?? payload.goals)
          : undefined,
        status,
        openedAt: payload.openedAt !== undefined
          ? this.toDate(payload.openedAt, null)
          : (status === HrPipCaseStatus.OPEN ? pipCase.openedAt ?? now : pipCase.openedAt),
        closedAt: payload.closedAt !== undefined
          ? this.toDate(payload.closedAt, null)
          : (status === HrPipCaseStatus.CLOSED ? pipCase.closedAt ?? now : pipCase.closedAt),
        closedReason: payload.closedReason !== undefined ? this.readString(payload.closedReason, null) : undefined,
        updatedBy: this.readString(payload.updatedBy ?? payload.actorId, pipCase.updatedBy ?? null)
      }
    });

    return this.ensurePipCase(id);
  }

  async runAutoDraftPip(payload: HrPayload = {}) {
    const limit = this.toInt(payload.limit, 200, 1, 1_000);
    const now = new Date();
    const todayIct = this.formatIctDateKey(now);
    const todayStart = this.parseIctDateKey(todayIct);

    const [employees, snapshots, submissions, existingCases] = await Promise.all([
      this.prisma.client.employee.findMany({
        where: { status: GenericStatus.ACTIVE },
        select: {
          id: true,
          department: true,
          position: true,
          managerId: true
        },
        take: limit
      }),
      this.prisma.client.hrDailyScoreSnapshot.findMany({
        where: {
          workDate: {
            gte: new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000)
          }
        },
        select: {
          employeeId: true,
          workDate: true,
          totalScore: true
        },
        orderBy: [{ employeeId: 'asc' }, { workDate: 'asc' }]
      }),
      this.prisma.client.hrAppendixSubmission.findMany({
        where: {
          workDate: {
            gte: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000)
          },
          appendixCode: {
            in: DAILY_REQUIRED_CODES
          }
        },
        select: {
          employeeId: true,
          appendixCode: true,
          workDate: true,
          status: true
        }
      }),
      this.prisma.client.hrPipCase.findMany({
        where: {
          status: {
            in: [HrPipCaseStatus.DRAFT, HrPipCaseStatus.OPEN]
          }
        },
        select: {
          employeeId: true,
          triggerReason: true,
          status: true
        }
      })
    ]);

    const openCaseSet = new Set(existingCases.map((item) => `${item.employeeId}::${item.triggerReason}`));

    const snapshotsByEmployee = new Map<string, Array<{ monthKey: string; total: number; count: number }>>();
    for (const row of snapshots) {
      const monthKey = this.formatIctMonthKey(row.workDate);
      const employeeRows = snapshotsByEmployee.get(row.employeeId) ?? [];
      const bucket = employeeRows.find((item) => item.monthKey === monthKey);
      if (bucket) {
        bucket.total += Number(row.totalScore ?? 0);
        bucket.count += 1;
      } else {
        employeeRows.push({ monthKey, total: Number(row.totalScore ?? 0), count: 1 });
      }
      snapshotsByEmployee.set(row.employeeId, employeeRows);
    }

    const logsByEmployeeDay = new Map<string, Set<HrAppendixCode>>();
    for (const row of submissions) {
      if (!row.workDate) continue;
      if (
        row.status !== HrAppendixSubmissionStatus.SUBMITTED &&
        row.status !== HrAppendixSubmissionStatus.APPROVED
      ) {
        continue;
      }
      const dayKey = this.formatIctDateKey(row.workDate);
      const mapKey = `${row.employeeId}::${dayKey}`;
      const set = logsByEmployeeDay.get(mapKey) ?? new Set<HrAppendixCode>();
      set.add(row.appendixCode);
      logsByEmployeeDay.set(mapKey, set);
    }

    const createdCases: Array<Record<string, unknown>> = [];

    for (const employee of employees) {
      const roleTemplate = await this.resolveRoleTemplateForEmployee(employee.id, {
        department: employee.department,
        position: employee.position
      });

      const monthlyBuckets = (snapshotsByEmployee.get(employee.id) ?? [])
        .filter((item) => item.count > 0)
        .map((item) => ({
          monthKey: item.monthKey,
          avg: Number((item.total / item.count).toFixed(2))
        }))
        .sort((a, b) => b.monthKey.localeCompare(a.monthKey));

      const monthlyCondition = this.checkConsecutiveMonthlyBelowThreshold(
        monthlyBuckets,
        roleTemplate.thresholds.pipMonthlyScoreBelow,
        roleTemplate.thresholds.pipConsecutiveMonths
      );

      const missingLogCount = this.computeMissingDailyLogs30d(employee.id, logsByEmployeeDay, now);
      const missingCondition = missingLogCount >= roleTemplate.thresholds.missingLogs30d;

      if (!monthlyCondition.matched && !missingCondition) {
        continue;
      }

      const triggerReason = monthlyCondition.matched
        ? `AUTO_PIP_MONTHLY_SCORE_BELOW_${roleTemplate.thresholds.pipMonthlyScoreBelow}`
        : `AUTO_PIP_MISSING_LOGS_${missingLogCount}`;

      const dedupeKey = `${employee.id}::${triggerReason}`;
      if (openCaseSet.has(dedupeKey)) {
        continue;
      }

      const baselineJson = {
        roleGroup: roleTemplate.roleGroup,
        monthlyAverages: monthlyBuckets.slice(0, 3),
        missingLogCount30d: missingLogCount,
        generatedAt: now.toISOString()
      };

      const goalsJson = {
        targetMonthlyScore: Math.max(roleTemplate.thresholds.pipMonthlyScoreBelow, 75),
        recoveryWindowDays: 60,
        mandatoryAppendixCodes: DAILY_REQUIRED_CODES,
        coachingCheckinWeekly: true
      };

      const sourceSubmission = await this.prisma.client.hrAppendixSubmission.create({
        data: {
          tenant_Id: this.prisma.getTenantId(),
          appendixCode: HrAppendixCode.PL10,
          employeeId: employee.id,
          workDate: todayStart,
          period: this.formatIctMonthKey(todayStart),
          payloadJson: this.toNullableInputJson({
            triggerReason,
            baseline: baselineJson,
            goals: goalsJson
          }),
          status: HrAppendixSubmissionStatus.DRAFT,
          dueAt: this.freezeDeadlineByWorkDate(todayStart),
          createdBy: this.readString(payload.actorId ?? payload.triggeredBy, 'system-auto-pip'),
          updatedBy: this.readString(payload.actorId ?? payload.triggeredBy, 'system-auto-pip')
        }
      });

      const pipCase = await this.prisma.client.hrPipCase.create({
        data: {
          tenant_Id: this.prisma.getTenantId(),
          employeeId: employee.id,
          sourceSubmissionId: sourceSubmission.id,
          triggerReason,
          baselineJson: this.toNullableInputJson(baselineJson),
          goalsJson: this.toNullableInputJson(goalsJson),
          status: HrPipCaseStatus.DRAFT,
          createdBy: this.readString(payload.actorId ?? payload.triggeredBy, 'system-auto-pip'),
          updatedBy: this.readString(payload.actorId ?? payload.triggeredBy, 'system-auto-pip')
        }
      });

      openCaseSet.add(dedupeKey);
      createdCases.push({
        pipCaseId: pipCase.id,
        employeeId: employee.id,
        triggerReason,
        sourceSubmissionId: sourceSubmission.id
      });

      const approver = await this.resolveSubmissionApprover(employee.id);
      await this.pushNotification(approver.approverId, {
        title: 'PIP draft tự động đã tạo',
        content: `Hệ thống tạo draft PL10 cho nhân sự ${employee.id} do ${triggerReason}.`
      });
    }

    return {
      scannedEmployees: employees.length,
      createdCount: createdCases.length,
      createdCases
    };
  }

  private async recomputeDailyScoreBySubmission(submissionId: string, reason: string) {
    const submission = await this.ensureAppendixSubmission(submissionId);
    if (!submission.workDate) {
      return null;
    }
    return this.recomputeDailyScore(submission.employeeId, submission.workDate, reason);
  }

  private async recomputeDailyScore(employeeId: string, workDate: Date, reason: string) {
    const employee = await this.ensureEmployee(employeeId);
    const normalizedWorkDate = this.parseIctDateKey(this.formatIctDateKey(workDate));
    const { startUtc, endUtc } = this.dayRangeUtcByIct(normalizedWorkDate);

    const submissions = await this.prisma.client.hrAppendixSubmission.findMany({
      where: {
        employeeId,
        workDate: {
          gte: startUtc,
          lt: endUtc
        }
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
    });

    const latestByCode = new Map<HrAppendixCode, (typeof submissions)[number]>();
    for (const row of submissions) {
      if (!latestByCode.has(row.appendixCode)) {
        latestByCode.set(row.appendixCode, row);
      }
    }

    let outputScore = 100;
    let activityScore = 100;
    let complianceScore = 100;
    let qualityScore = 100;
    const reasons: string[] = [];

    for (const code of DAILY_REQUIRED_CODES) {
      const submission = latestByCode.get(code);
      if (!submission) {
        activityScore -= 25;
        complianceScore -= 25;
        reasons.push(`missing-${code}`);
        continue;
      }

      if (submission.status === HrAppendixSubmissionStatus.REJECTED) {
        qualityScore -= 20;
        reasons.push(`rejected-${code}`);
      }
      if (submission.status === HrAppendixSubmissionStatus.DRAFT) {
        activityScore -= 10;
        reasons.push(`draft-${code}`);
      }
      if (submission.status === HrAppendixSubmissionStatus.SUBMITTED) {
        activityScore -= 5;
      }

      if (submission.dueAt && submission.submittedAt && submission.submittedAt.getTime() > submission.dueAt.getTime()) {
        complianceScore -= 15;
        reasons.push(`late-${code}`);
      }

      if (submission.status === HrAppendixSubmissionStatus.APPROVED) {
        outputScore += 5;
        qualityScore += 5;
      }
    }

    for (const [code, submission] of latestByCode.entries()) {
      if (DAILY_REQUIRED_CODES.includes(code)) {
        continue;
      }

      if (submission.status === HrAppendixSubmissionStatus.APPROVED) {
        outputScore += 3;
      }
      if (submission.status === HrAppendixSubmissionStatus.REJECTED) {
        qualityScore -= 5;
        reasons.push(`rejected-${code}`);
      }
      if (submission.status === HrAppendixSubmissionStatus.SUBMITTED && APPROVAL_REQUIRED_CODES.has(code)) {
        complianceScore -= 5;
      }
    }

    outputScore = this.clamp(outputScore, 0, 100);
    activityScore = this.clamp(activityScore, 0, 100);
    complianceScore = this.clamp(complianceScore, 0, 100);
    qualityScore = this.clamp(qualityScore, 0, 100);

    const roleTemplate = await this.resolveRoleTemplateForEmployee(employee.id, {
      department: employee.department,
      position: employee.position
    });

    const totalScore = Number(((
      outputScore * roleTemplate.pillarWeights.output
      + activityScore * roleTemplate.pillarWeights.activity
      + complianceScore * roleTemplate.pillarWeights.compliance
      + qualityScore * roleTemplate.pillarWeights.quality
    ) / 100).toFixed(2));

    const freezeAt = this.freezeDeadlineByWorkDate(normalizedWorkDate);
    const status = new Date().getTime() > freezeAt.getTime() ? HrDailyScoreStatus.FINAL : HrDailyScoreStatus.PROVISIONAL;

    const snapshot = await this.prisma.client.hrDailyScoreSnapshot.upsert({
      where: {
        tenant_Id_employeeId_workDate: {
          tenant_Id: this.prisma.getTenantId(),
          employeeId,
          workDate: normalizedWorkDate
        }
      },
      create: {
        tenant_Id: this.prisma.getTenantId(),
        employeeId,
        workDate: normalizedWorkDate,
        outputScore,
        activityScore,
        complianceScore,
        qualityScore,
        totalScore,
        status,
        freezeAt,
        finalizedAt: status === HrDailyScoreStatus.FINAL ? new Date() : null,
        reasonsJson: this.toNullableInputJson(reasons),
        metadataJson: this.toNullableInputJson({
          roleGroup: roleTemplate.roleGroup,
          weights: roleTemplate.pillarWeights,
          reason
        })
      },
      update: {
        outputScore,
        activityScore,
        complianceScore,
        qualityScore,
        totalScore,
        status,
        freezeAt,
        finalizedAt: status === HrDailyScoreStatus.FINAL ? new Date() : null,
        reasonsJson: this.toNullableInputJson(reasons),
        metadataJson: this.toNullableInputJson({
          roleGroup: roleTemplate.roleGroup,
          weights: roleTemplate.pillarWeights,
          reason
        })
      }
    });

    return snapshot;
  }

  private async resolveRoleTemplateForEmployee(
    employeeId: string,
    fallbackEmployeeInfo?: { department: string | null | undefined; position: string | null | undefined }
  ): Promise<RoleTemplateRuntime> {
    const employee = fallbackEmployeeInfo ?? (await this.prisma.client.employee.findFirst({
      where: { id: employeeId },
      select: { department: true, position: true }
    }));

    const roleGroup = this.resolveRoleGroup(employee?.department, employee?.position);
    const fromDb = await this.prisma.client.hrScoreRoleTemplate.findFirst({
      where: {
        roleGroup,
        status: { in: [GenericStatus.ACTIVE, GenericStatus.DRAFT] }
      }
    });

    const fallback = DEFAULT_ROLE_TEMPLATES[roleGroup] ?? DEFAULT_ROLE_TEMPLATES.GENERAL;
    if (!fromDb) {
      return fallback;
    }

    const weights = this.toJsonObject(fromDb.pillarWeights);
    const thresholds = this.toJsonObject(fromDb.thresholds);

    return {
      roleGroup,
      pillarWeights: this.normalizePillarWeights({
        output: this.toNumber(weights.output) ?? fallback.pillarWeights.output,
        activity: this.toNumber(weights.activity) ?? fallback.pillarWeights.activity,
        compliance: this.toNumber(weights.compliance) ?? fallback.pillarWeights.compliance,
        quality: this.toNumber(weights.quality) ?? fallback.pillarWeights.quality
      }),
      thresholds: {
        pipMonthlyScoreBelow: this.toNumber(thresholds.pipMonthlyScoreBelow) ?? fallback.thresholds.pipMonthlyScoreBelow,
        pipConsecutiveMonths: this.toInt(thresholds.pipConsecutiveMonths, fallback.thresholds.pipConsecutiveMonths, 1, 6),
        missingLogs30d: this.toInt(thresholds.missingLogs30d, fallback.thresholds.missingLogs30d, 1, 60)
      }
    };
  }

  private async resolveSubmissionApprover(employeeId: string) {
    const employee = await this.ensureEmployee(employeeId);
    const managerEmployeeId = this.readString(employee.managerId, null);

    if (managerEmployeeId) {
      return {
        approverId: await this.resolveUserIdByEmployeeId(managerEmployeeId),
        source: 'manager'
      };
    }

    const fallbackManager = await this.prisma.client.employee.findFirst({
      where: {
        status: GenericStatus.ACTIVE,
        OR: [
          { department: { contains: 'HCNS', mode: 'insensitive' } },
          { department: { contains: 'nhan su', mode: 'insensitive' } },
          { department: { contains: 'human', mode: 'insensitive' } },
          { position: { contains: 'hcns', mode: 'insensitive' } },
          { position: { contains: 'hr manager', mode: 'insensitive' } }
        ]
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true }
    });

    if (fallbackManager?.id) {
      return {
        approverId: await this.resolveUserIdByEmployeeId(fallbackManager.id),
        source: 'hcns-manager'
      };
    }

    return {
      approverId: null,
      source: 'none'
    };
  }

  private async resolveUserIdByEmployeeId(employeeId: string) {
    const user = await this.prisma.client.user.findFirst({
      where: {
        employeeId,
        isActive: true
      },
      select: { id: true }
    });

    return user?.id ?? employeeId;
  }

  private async createApprovalTask(payload: {
    targetType: string;
    targetId: string;
    requesterId: string;
    approverId: string | null;
    dueAt: Date | null;
    contextJson: Record<string, unknown>;
  }) {
    if (payload.approverId && this.workflowsService) {
      try {
        await this.workflowsService.createApproval({
          targetType: payload.targetType,
          targetId: payload.targetId,
          requesterId: payload.requesterId,
          approverId: payload.approverId,
          dueAt: payload.dueAt ? payload.dueAt.toISOString() : undefined,
          contextJson: payload.contextJson,
          status: GenericStatus.PENDING,
          stepKey: 'MANAGER_APPROVAL'
        });
        return;
      } catch {
        // Fall back to direct approval record if workflow service cannot resolve runtime context.
      }
    }

    await this.prisma.client.approval.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        targetType: payload.targetType,
        targetId: payload.targetId,
        requesterId: payload.requesterId,
        approverId: payload.approverId,
        assignmentType: 'USER',
        assignmentSource: payload.approverId,
        stepKey: 'MANAGER_APPROVAL',
        contextJson: this.toNullableInputJson(payload.contextJson),
        dueAt: payload.dueAt,
        status: GenericStatus.PENDING
      }
    });
  }

  private async closeApprovalTasks(
    targetType: string,
    targetId: string,
    status: GenericStatus,
    actorId: string,
    note: unknown
  ) {
    await this.prisma.client.approval.updateMany({
      where: {
        targetType,
        targetId,
        status: GenericStatus.PENDING
      },
      data: {
        status,
        decidedAt: new Date(),
        decisionActorId: actorId,
        decisionNote: this.readString(note, null)
      }
    });
  }

  private async pushNotification(
    userId: string | null,
    payload: {
      title: string;
      content: string;
    }
  ) {
    if (!userId || !this.notificationsService) {
      return;
    }

    try {
      await this.notificationsService.create({
        userId,
        title: payload.title,
        content: payload.content,
        templateVersion: 'hr-regulation-v1'
      });
    } catch {
      // Do not block core HR flow because of notification dispatch errors.
    }
  }

  private async replaceSubmissionEvidences(submissionId: string, evidencesRaw: unknown, replaceAll: boolean) {
    if (replaceAll) {
      await this.prisma.client.hrAppendixEvidence.deleteMany({
        where: { submissionId }
      });
    }

    if (!Array.isArray(evidencesRaw) || evidencesRaw.length === 0) {
      return;
    }

    const rows = evidencesRaw
      .map((item) => this.normalizeEvidence(item))
      .filter((item): item is { evidenceType: 'LINK' | 'FILE'; url: string | null; objectKey: string | null; note: string | null } => item !== null);

    if (!rows.length) {
      return;
    }

    await this.prisma.client.hrAppendixEvidence.createMany({
      data: rows.map((row) => ({
        tenant_Id: this.prisma.getTenantId(),
        submissionId,
        evidenceType: row.evidenceType,
        url: row.url,
        objectKey: row.objectKey,
        note: row.note
      }))
    });
  }

  private normalizeEvidence(item: unknown) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return null;
    }

    const raw = item as Record<string, unknown>;
    const evidenceType = this.readString(raw.evidenceType, null)?.toUpperCase();
    if (!evidenceType || !['LINK', 'FILE'].includes(evidenceType)) {
      return null;
    }

    return {
      evidenceType: evidenceType as 'LINK' | 'FILE',
      url: this.readString(raw.url, null),
      objectKey: this.readString(raw.objectKey, null),
      note: this.readString(raw.note, null)
    };
  }

  private computeMissingDailyLogs30d(
    employeeId: string,
    logsByEmployeeDay: Map<string, Set<HrAppendixCode>>,
    now: Date
  ) {
    let missingCount = 0;
    for (let i = 0; i < 30; i += 1) {
      const day = this.addIctDays(now, -i);
      const dayOfWeek = this.dayOfWeekIct(day);
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        continue;
      }

      const dayKey = this.formatIctDateKey(day);
      const mapKey = `${employeeId}::${dayKey}`;
      const logs = logsByEmployeeDay.get(mapKey);
      const hasAll = Boolean(logs && DAILY_REQUIRED_CODES.every((code) => logs.has(code)));
      if (!hasAll) {
        missingCount += 1;
      }
    }
    return missingCount;
  }

  private checkConsecutiveMonthlyBelowThreshold(
    monthlyBuckets: Array<{ monthKey: string; avg: number }>,
    threshold: number,
    consecutiveMonths: number
  ) {
    if (monthlyBuckets.length < consecutiveMonths) {
      return { matched: false, months: [] as Array<{ monthKey: string; avg: number }> };
    }

    const slice = monthlyBuckets.slice(0, consecutiveMonths);
    const matched = slice.every((item) => item.avg < threshold) && this.areMonthsConsecutive(slice.map((item) => item.monthKey));
    return {
      matched,
      months: slice
    };
  }

  private areMonthsConsecutive(monthKeys: string[]) {
    if (monthKeys.length <= 1) return true;

    for (let i = 0; i < monthKeys.length - 1; i += 1) {
      const current = this.parseMonthKey(monthKeys[i]);
      const next = this.parseMonthKey(monthKeys[i + 1]);
      const prev = this.addMonth(current, -1);
      if (prev.year !== next.year || prev.month !== next.month) {
        return false;
      }
    }

    return true;
  }

  private addMonth(source: { year: number; month: number }, diff: number) {
    const total = source.year * 12 + (source.month - 1) + diff;
    const year = Math.floor(total / 12);
    const month = (total % 12 + 12) % 12 + 1;
    return { year, month };
  }

  private parseMonthKey(monthKey: string) {
    const [yearRaw, monthRaw] = monthKey.split('-');
    return {
      year: Number(yearRaw),
      month: Number(monthRaw)
    };
  }

  private resolveRoleGroup(department: string | null | undefined, position: string | null | undefined) {
    const text = `${department ?? ''} ${position ?? ''}`.toUpperCase();
    if (text.includes('SALE')) return 'SALES';
    if (text.includes('MARKETING')) return 'MARKETING';
    if (text.includes('HCNS') || text.includes('NHAN SU') || text.includes('HUMAN')) return 'HCNS';
    if (text.includes('KE TOAN') || text.includes('ACCOUNT')) return 'ACCOUNTING';
    return 'GENERAL';
  }

  private normalizePillarWeights(input: { output: number; activity: number; compliance: number; quality: number }) {
    const sanitized = {
      output: this.clamp(Number(input.output) || 0, 0, 100),
      activity: this.clamp(Number(input.activity) || 0, 0, 100),
      compliance: this.clamp(Number(input.compliance) || 0, 0, 100),
      quality: this.clamp(Number(input.quality) || 0, 0, 100)
    };

    const sum = sanitized.output + sanitized.activity + sanitized.compliance + sanitized.quality;
    if (sum <= 0) {
      return { ...DEFAULT_ROLE_TEMPLATES.GENERAL.pillarWeights };
    }

    return {
      output: Number(((sanitized.output * 100) / sum).toFixed(2)),
      activity: Number(((sanitized.activity * 100) / sum).toFixed(2)),
      compliance: Number(((sanitized.compliance * 100) / sum).toFixed(2)),
      quality: Number(((sanitized.quality * 100) / sum).toFixed(2))
    };
  }

  private isWithinTPlusOneWindow(workDate: Date, now: Date) {
    return now.getTime() <= this.freezeDeadlineByWorkDate(workDate).getTime();
  }

  private freezeDeadlineByWorkDate(workDate: Date) {
    const dayKey = this.formatIctDateKey(workDate);
    const dayStart = this.parseIctDateKey(dayKey);
    const nextDay = this.addIctDays(dayStart, 1);
    const nextDayKey = this.formatIctDateKey(nextDay);
    return this.parseIctDateTime(`${nextDayKey}T23:59:59.999`);
  }

  private computeDefaultDueAt(appendixCode: HrAppendixCode, workDate: Date | null) {
    if (!workDate) {
      return null;
    }

    const dateKey = this.formatIctDateKey(workDate);
    if (DAILY_REQUIRED_CODES.includes(appendixCode)) {
      return this.parseIctDateTime(`${dateKey}T23:59:59.999`);
    }

    const nextDayKey = this.formatIctDateKey(this.addIctDays(workDate, 1));
    return this.parseIctDateTime(`${nextDayKey}T23:59:59.999`);
  }

  private dayRangeUtcByIct(workDate: Date) {
    const dayKey = this.formatIctDateKey(workDate);
    const startUtc = this.parseIctDateTime(`${dayKey}T00:00:00.000`);
    const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
    return {
      startUtc,
      endUtc
    };
  }

  private formatIctDateKey(date: Date) {
    const utcMillis = date.getTime();
    const ictMillis = utcMillis + TZ_OFFSET_MINUTES * 60 * 1000;
    return new Date(ictMillis).toISOString().slice(0, 10);
  }

  private formatIctMonthKey(date: Date) {
    const dateKey = this.formatIctDateKey(date);
    return dateKey.slice(0, 7);
  }

  private parseIctDateKey(dateKey: string) {
    return this.parseIctDateTime(`${dateKey}T00:00:00.000`);
  }

  private parseIctDateTime(localDateTime: string) {
    const normalized = `${localDateTime}+07:00`;
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Ngày giờ không hợp lệ: ${localDateTime}`);
    }
    return parsed;
  }

  private addIctDays(date: Date, diffDays: number) {
    const dayKey = this.formatIctDateKey(date);
    const startUtc = this.parseIctDateKey(dayKey);
    return new Date(startUtc.getTime() + diffDays * 24 * 60 * 60 * 1000);
  }

  private dayOfWeekIct(date: Date) {
    const dayKey = this.formatIctDateKey(date);
    const dayDate = this.parseIctDateKey(dayKey);
    const utcMillis = dayDate.getTime() + TZ_OFFSET_MINUTES * 60 * 1000;
    return new Date(utcMillis).getUTCDay();
  }

  private normalizeAppendixFieldType(value: unknown, fallback: AppendixFieldType = 'text'): AppendixFieldType {
    const normalized = (this.readString(value, '') ?? '').toLowerCase();
    return APPENDIX_FIELD_TYPES.includes(normalized as AppendixFieldType)
      ? (normalized as AppendixFieldType)
      : fallback;
  }

  private normalizeAppendixAggregator(value: unknown, fallback: AppendixFieldAggregator = 'none'): AppendixFieldAggregator {
    const normalized = (this.readString(value, '') ?? '').toLowerCase();
    return APPENDIX_FIELD_AGGREGATORS.includes(normalized as AppendixFieldAggregator)
      ? (normalized as AppendixFieldAggregator)
      : fallback;
  }

  private normalizeAppendixStatus(value: unknown, fallback: AppendixFieldStatus = 'ACTIVE'): AppendixFieldStatus {
    const normalized = (this.readString(value, '') ?? '').toUpperCase();
    return APPENDIX_FIELD_STATUSES.includes(normalized as AppendixFieldStatus)
      ? (normalized as AppendixFieldStatus)
      : fallback;
  }

  private normalizeAppendixFieldKey(value: unknown, fallback = '') {
    const normalized = (this.readString(value, '') ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
    if (normalized) {
      return normalized;
    }
    return (this.readString(fallback, '') ?? '')
      .replace(/[^a-zA-Z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  }

  private normalizeAppendixFieldVisibility(value: unknown): 'visible' | 'hidden' {
    return (this.readString(value, '') ?? '').toLowerCase() === 'hidden' ? 'hidden' : 'visible';
  }

  private normalizeAppendixFieldCatalog(raw: unknown): AppendixFieldCatalogItemRuntime[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    const normalized: AppendixFieldCatalogItemRuntime[] = [];
    const seen = new Set<string>();
    for (const row of raw) {
      const item = this.toJsonObject(row);
      const key = this.normalizeAppendixFieldKey(item.key ?? item.id, item.id as string);
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      const analyticsEnabled = Boolean(item.analyticsEnabled === true);
      normalized.push({
        id: this.readString(item.id, key) ?? key,
        key,
        label: this.readString(item.label, key) ?? key,
        description: this.readString(item.description, '') ?? '',
        type: this.normalizeAppendixFieldType(item.type, 'text'),
        options: Array.isArray(item.options)
          ? item.options.map((entry) => this.readString(entry, null)).filter((entry): entry is string => Boolean(entry))
          : [],
        validation: this.toJsonObject(item.validation),
        analyticsEnabled,
        aggregator: analyticsEnabled
          ? this.normalizeAppendixAggregator(item.aggregator, 'count')
          : 'none',
        status: this.normalizeAppendixStatus(item.status, 'ACTIVE'),
        version: this.toInt(item.version, 1, 1, 1000)
      });
    }
    return normalized.sort((left, right) => left.key.localeCompare(right.key));
  }

  private resolveDefaultAppendixRuntime(): { fieldCatalog: AppendixFieldCatalogItemRuntime[]; appendices: AppendixCatalogItemRuntime[] } {
    const fieldCatalog = DEFAULT_APPENDIX_FIELD_CATALOG.map((item) => ({ ...item }));
    const fieldMap = new Map(fieldCatalog.map((field) => [field.key, field]));
    const appendices: AppendixCatalogItemRuntime[] = APPENDIX_CODE_VALUES.map((code) => {
      const defaultMeta = DEFAULT_APPENDIX_TEMPLATE_META[code] ?? { name: code, description: '' };
      const templateRows = DEFAULT_APPENDIX_TEMPLATE_FIELDS[code] ?? [];
      const fields: AppendixTemplateFieldRuntime[] = [];
      for (const rowRaw of templateRows) {
        const row = this.toJsonObject(rowRaw);
        const fieldKey = this.normalizeAppendixFieldKey(row.fieldKey);
        const globalField = fieldMap.get(fieldKey);
        if (!globalField) {
          continue;
        }
        fields.push({
          ...globalField,
          required: Boolean(row.required === true),
          placeholder: this.readString(row.placeholder, '') ?? '',
          defaultValue: row.defaultValue ?? null,
          helpText: this.readString(row.helpText, '') ?? '',
          visibility: this.normalizeAppendixFieldVisibility(row.visibility),
          kpiAlias: this.readString(row.kpiAlias, '') ?? '',
          source: 'global'
        });
      }
      return {
        code,
        name: defaultMeta.name,
        description: defaultMeta.description,
        fields
      };
    });
    return { fieldCatalog, appendices };
  }

  private resolveAppendixFieldFromCatalog(
    raw: unknown,
    fieldMap: Map<string, AppendixFieldCatalogItemRuntime>
  ): string {
    const candidate = this.readString(raw, '');
    if (!candidate) {
      return '';
    }
    const normalizedCandidate = this.normalizeAppendixFieldKey(candidate);
    for (const field of fieldMap.values()) {
      if (field.key === candidate || field.key === normalizedCandidate) {
        return field.key;
      }
      if (this.normalizeAppendixFieldKey(field.id) === normalizedCandidate) {
        return field.key;
      }
      if (this.normalizeAppendixFieldKey(field.label) === normalizedCandidate) {
        return field.key;
      }
    }
    return '';
  }

  private normalizeAppendixCatalog(
    raw: unknown,
    fieldCatalog: AppendixFieldCatalogItemRuntime[]
  ): AppendixCatalogItemRuntime[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    const catalogMap = new Map(fieldCatalog.map((field) => [field.key, field]));
    const normalized: AppendixCatalogItemRuntime[] = [];
    for (const row of raw) {
      const item = this.toJsonObject(row);
      const code = this.readString(item.code, null)?.toUpperCase() ?? '';
      if (!code || !/^PL\d{2}$/.test(code)) {
        continue;
      }
      const rawFields = Array.isArray(item.fields) ? item.fields : [];
      const seen = new Set<string>();
      const fields: AppendixTemplateFieldRuntime[] = [];
      for (const rawField of rawFields) {
        const fieldRecord = this.toJsonObject(rawField);
        const resolvedFromCatalog = this.resolveAppendixFieldFromCatalog(
          fieldRecord.fieldKey ?? fieldRecord.key ?? fieldRecord.id ?? rawField,
          catalogMap
        );
        const fieldKey = resolvedFromCatalog || this.normalizeAppendixFieldKey(fieldRecord.fieldKey ?? fieldRecord.key ?? fieldRecord.id ?? rawField);
        if (!fieldKey || seen.has(fieldKey)) {
          continue;
        }
        seen.add(fieldKey);

        const globalField = catalogMap.get(fieldKey);
        if (globalField) {
          fields.push({
            ...globalField,
            required: Boolean(fieldRecord.required === true),
            placeholder: this.readString(fieldRecord.placeholder, '') ?? '',
            defaultValue: fieldRecord.defaultValue ?? null,
            helpText: this.readString(fieldRecord.helpText, '') ?? '',
            visibility: this.normalizeAppendixFieldVisibility(fieldRecord.visibility),
            kpiAlias: this.readString(fieldRecord.kpiAlias, '') ?? '',
            source: 'global'
          });
          continue;
        }

        if (!fieldKey.toLowerCase().startsWith(`${code.toLowerCase()}_`)) {
          continue;
        }

        fields.push({
          id: fieldKey,
          key: fieldKey,
          label: this.readString(fieldRecord.label, fieldKey) ?? fieldKey,
          description: this.readString(fieldRecord.description, '') ?? '',
          type: this.normalizeAppendixFieldType(fieldRecord.type, 'text'),
          options: Array.isArray(fieldRecord.options)
            ? fieldRecord.options.map((entry) => this.readString(entry, null)).filter((entry): entry is string => Boolean(entry))
            : [],
          validation: this.toJsonObject(fieldRecord.validation),
          analyticsEnabled: Boolean(fieldRecord.analyticsEnabled === true),
          aggregator: this.normalizeAppendixAggregator(fieldRecord.aggregator, 'none'),
          status: this.normalizeAppendixStatus(fieldRecord.status, 'ACTIVE'),
          version: this.toInt(fieldRecord.version, 1, 1, 1000),
          required: Boolean(fieldRecord.required === true),
          placeholder: this.readString(fieldRecord.placeholder, '') ?? '',
          defaultValue: fieldRecord.defaultValue ?? null,
          helpText: this.readString(fieldRecord.helpText, '') ?? '',
          visibility: this.normalizeAppendixFieldVisibility(fieldRecord.visibility),
          kpiAlias: this.readString(fieldRecord.kpiAlias, '') ?? '',
          source: 'appendix-local'
        });
      }

      normalized.push({
        code,
        name: this.readString(item.name, code) ?? code,
        description: this.readString(item.description, '') ?? '',
        fields
      });
    }
    return normalized.sort((left, right) => left.code.localeCompare(right.code));
  }

  private async getAppendixRuntime(): Promise<{ fieldCatalog: AppendixFieldCatalogItemRuntime[]; appendices: AppendixCatalogItemRuntime[] }> {
    const fallbackRuntime = this.resolveDefaultAppendixRuntime();
    if (!this.runtimeSettings) {
      return fallbackRuntime;
    }

    try {
      const runtime = await this.runtimeSettings.getHrPolicyRuntime();
      const runtimeRecord = this.toJsonObject(runtime);
      const fieldCatalogRaw = runtimeRecord.appendixFieldCatalog;
      const appendicesRaw = runtimeRecord.appendixCatalog;
      const fieldCatalog = this.normalizeAppendixFieldCatalog(fieldCatalogRaw);
      const effectiveFieldCatalog = fieldCatalog.length > 0 ? fieldCatalog : fallbackRuntime.fieldCatalog;
      const appendices = this.normalizeAppendixCatalog(appendicesRaw, effectiveFieldCatalog);
      return {
        fieldCatalog: effectiveFieldCatalog,
        appendices: appendices.length > 0 ? appendices : fallbackRuntime.appendices
      };
    } catch {
      return fallbackRuntime;
    }
  }

  private findAppendixDefinition(appendices: AppendixCatalogItemRuntime[], appendixCode: HrAppendixCode) {
    const matched = appendices.find((item) => item.code === appendixCode);
    if (matched) {
      return matched;
    }
    const fallback = this.resolveDefaultAppendixRuntime().appendices.find((item) => item.code === appendixCode);
    if (fallback) {
      return fallback;
    }
    throw new BadRequestException(`Không tìm thấy cấu hình appendix ${appendixCode}.`);
  }

  private normalizeSubmissionFieldValue(field: AppendixTemplateFieldRuntime, rawValue: unknown) {
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      return null;
    }

    const validation = this.toJsonObject(field.validation);

    if (field.type === 'number') {
      const numeric = Number(rawValue);
      if (!Number.isFinite(numeric)) {
        throw new BadRequestException(`Truong ${field.label} bat buoc la so.`);
      }
      const min = this.toNumber(validation.min);
      const max = this.toNumber(validation.max);
      if (min !== null && numeric < min) {
        throw new BadRequestException(`Truong ${field.label} phai >= ${min}.`);
      }
      if (max !== null && numeric > max) {
        throw new BadRequestException(`Truong ${field.label} phai <= ${max}.`);
      }
      return numeric;
    }

    if (field.type === 'boolean') {
      if (typeof rawValue === 'boolean') {
        return rawValue;
      }
      const normalized = String(rawValue).trim().toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
      }
      if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
      }
      throw new BadRequestException(`Truong ${field.label} bat buoc la true/false.`);
    }

    if (field.type === 'date') {
      const text = String(rawValue).trim();
      if (!text) {
        return null;
      }
      const datePart = text.includes('T') ? text.slice(0, 10) : text;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        throw new BadRequestException(`Truong ${field.label} bat buoc theo dinh dang YYYY-MM-DD.`);
      }
      return datePart;
    }

    const textValue = String(rawValue).trim();
    if (!textValue) {
      return null;
    }

    if (field.type === 'select' && field.options.length > 0 && !field.options.includes(textValue)) {
      throw new BadRequestException(`Truong ${field.label} khong nam trong danh muc cho phep.`);
    }

    const minLength = this.toNumber(validation.minLength);
    const maxLength = this.toNumber(validation.maxLength);
    if (minLength !== null && textValue.length < minLength) {
      throw new BadRequestException(`Truong ${field.label} toi thieu ${minLength} ky tu.`);
    }
    if (maxLength !== null && textValue.length > maxLength) {
      throw new BadRequestException(`Truong ${field.label} toi da ${maxLength} ky tu.`);
    }
    const pattern = this.readString(validation.pattern, null);
    if (pattern) {
      try {
        const regex = new RegExp(pattern);
        if (!regex.test(textValue)) {
          throw new BadRequestException(`Truong ${field.label} khong dung dinh dang.`);
        }
      } catch {
        // Ignore invalid regex pattern from settings to avoid breaking runtime forms.
      }
    }

    return textValue;
  }

  private normalizeSubmissionPayload(appendix: AppendixCatalogItemRuntime, rawPayload: unknown) {
    const inputPayload = this.toJsonObject(rawPayload);
    const outputPayload: Record<string, unknown> = {};
    const appendixFields = appendix.fields.filter((field) => field.visibility !== 'hidden');

    for (const field of appendixFields) {
      const fallbackValue = field.defaultValue ?? null;
      const rawValue = Object.prototype.hasOwnProperty.call(inputPayload, field.key)
        ? inputPayload[field.key]
        : fallbackValue;
      const normalizedValue = this.normalizeSubmissionFieldValue(field, rawValue);
      const requiredByValidation = this.toJsonObject(field.validation).required === true;
      if ((field.required || requiredByValidation) && (normalizedValue === null || normalizedValue === undefined || normalizedValue === '')) {
        throw new BadRequestException(`Truong ${field.label} la bat buoc.`);
      }
      outputPayload[field.key] = normalizedValue;
    }

    for (const [rawKey, rawValue] of Object.entries(inputPayload)) {
      if (rawKey === '_schema') {
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(outputPayload, rawKey)) {
        continue;
      }
      outputPayload[rawKey] = rawValue;
    }

    outputPayload._schema = {
      appendixCode: appendix.code,
      capturedAt: new Date().toISOString(),
      fieldVersions: Object.fromEntries(appendix.fields.map((field) => [field.key, field.version]))
    };

    return outputPayload;
  }

  private isAuthEnabled() {
    const env = String(this.config?.get<string>('AUTH_ENABLED', 'false') ?? 'false').trim().toLowerCase();
    return env === 'true';
  }

  private resolveRegulationActor() {
    const authUserRaw = this.cls?.get(AUTH_USER_CONTEXT_KEY) as AuthUser | undefined;
    const authUser = authUserRaw && typeof authUserRaw === 'object' ? authUserRaw : undefined;
    const roleRaw = this.readString(authUser?.role, null)?.toUpperCase();
    const role = (Object.values(UserRole) as string[]).includes(roleRaw ?? '')
      ? (roleRaw as UserRole)
      : ('ANONYMOUS' as const);
    const employeeId = this.readString(authUser?.employeeId, null)
      ?? this.readString(authUser?.userId, null)
      ?? this.readString(authUser?.sub, null);

    return {
      authEnabled: this.isAuthEnabled(),
      role,
      employeeId
    };
  }

  private async collectManagedEmployeeIds(managerId: string) {
    const allEmployees = await this.prisma.client.employee.findMany({
      where: {
        status: { not: GenericStatus.ARCHIVED }
      },
      select: { id: true, managerId: true }
    });
    const byManager = new Map<string, string[]>();
    for (const employee of allEmployees) {
      if (!employee.managerId) continue;
      if (!byManager.has(employee.managerId)) {
        byManager.set(employee.managerId, []);
      }
      byManager.get(employee.managerId)?.push(employee.id);
    }

    const result = new Set<string>();
    const queue = [...(byManager.get(managerId) ?? [])];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      if (result.has(current)) continue;
      result.add(current);
      for (const child of byManager.get(current) ?? []) {
        queue.push(child);
      }
    }

    return Array.from(result);
  }

  private async resolveRegulationAccessContext(): Promise<RegulationAccessContext> {
    const actor = this.resolveRegulationActor();
    if (actor.role === 'ANONYMOUS') {
      return {
        scope: actor.authEnabled ? 'self' : 'company',
        role: actor.role,
        requesterEmployeeId: actor.employeeId,
        allowedEmployeeIds: actor.authEnabled && actor.employeeId ? [actor.employeeId] : null,
        canOverrideEmployeeId: !actor.authEnabled
      };
    }

    if (actor.role === UserRole.ADMIN) {
      return {
        scope: 'company',
        role: actor.role,
        requesterEmployeeId: actor.employeeId,
        allowedEmployeeIds: null,
        canOverrideEmployeeId: true
      };
    }

    const requesterEmployeeId = actor.employeeId;
    if (!requesterEmployeeId) {
      throw new ForbiddenException('Tài khoản chưa liên kết employeeId để truy cập dữ liệu quy chế.');
    }

    if (actor.role === UserRole.STAFF) {
      return {
        scope: 'self',
        role: actor.role,
        requesterEmployeeId,
        allowedEmployeeIds: [requesterEmployeeId],
        canOverrideEmployeeId: false
      };
    }

    const requesterEmployee = await this.prisma.client.employee.findFirst({
      where: { id: requesterEmployeeId },
      select: { id: true, departmentId: true, department: true }
    });
    if (!requesterEmployee) {
      return {
        scope: 'self',
        role: actor.role,
        requesterEmployeeId,
        allowedEmployeeIds: [requesterEmployeeId],
        canOverrideEmployeeId: false
      };
    }

    const teamEmployeeIds = await this.collectManagedEmployeeIds(requesterEmployee.id);
    const departmentEmployees = await this.prisma.client.employee.findMany({
      where: {
        OR: [
          ...(requesterEmployee.departmentId ? [{ departmentId: requesterEmployee.departmentId }] : []),
          ...(requesterEmployee.department ? [{ department: requesterEmployee.department }] : [])
        ]
      },
      select: { id: true }
    });

    const allowedEmployeeIds = departmentEmployees.length > 0
      ? departmentEmployees.map((employee) => employee.id)
      : Array.from(new Set([requesterEmployee.id, ...teamEmployeeIds]));

    return {
      scope: departmentEmployees.length > 0 ? 'department' : 'team',
      role: actor.role,
      requesterEmployeeId,
      allowedEmployeeIds,
      canOverrideEmployeeId: false
    };
  }

  private applyEmployeeScope(where: Record<string, unknown>, access: RegulationAccessContext) {
    if (access.allowedEmployeeIds === null) {
      return;
    }
    if (access.allowedEmployeeIds.length === 0) {
      where.employeeId = '__NO_ACCESS__';
      return;
    }
    if (typeof where.employeeId === 'string' && where.employeeId.trim()) {
      return;
    }
    where.employeeId = {
      in: access.allowedEmployeeIds
    };
  }

  private assertEmployeeIdReadable(access: RegulationAccessContext, employeeId: string) {
    if (access.allowedEmployeeIds === null) {
      return;
    }
    if (!access.allowedEmployeeIds.includes(employeeId)) {
      throw new ForbiddenException('Không có quyền xem dữ liệu nhân viên này.');
    }
  }

  private assertEmployeeIdWritable(access: RegulationAccessContext, employeeId: string) {
    if (access.canOverrideEmployeeId) {
      this.assertEmployeeIdReadable(access, employeeId);
      return;
    }
    if (!access.requesterEmployeeId || access.requesterEmployeeId !== employeeId) {
      throw new ForbiddenException('Bạn chỉ được thao tác trên dữ liệu của chính mình.');
    }
  }

  private resolveWritableEmployeeId(
    access: RegulationAccessContext,
    requestedEmployeeId: string | null,
    fallbackEmployeeId?: string | null
  ) {
    if (access.canOverrideEmployeeId) {
      return requestedEmployeeId ?? fallbackEmployeeId ?? access.requesterEmployeeId;
    }
    if (!access.requesterEmployeeId) {
      throw new ForbiddenException('Không xác định được employeeId của tài khoản hiện tại.');
    }
    return access.requesterEmployeeId;
  }

  private async ensureEmployee(employeeId: string) {
    const employee = await this.prisma.client.employee.findFirst({
      where: { id: employeeId }
    });
    if (!employee) {
      throw new NotFoundException(`Không tìm thấy nhân sự: ${employeeId}`);
    }
    return employee;
  }

  private async ensureAppendixSubmission(id: string) {
    const submission = await this.prisma.client.hrAppendixSubmission.findFirst({
      where: { id },
      include: {
        template: true,
        evidences: true,
        revisions: {
          orderBy: { createdAt: 'desc' },
          take: 20
        }
      }
    });

    if (!submission) {
      throw new NotFoundException(`Không tìm thấy appendix submission: ${id}`);
    }

    return submission;
  }

  private async ensureAppendixRevision(id: string) {
    const revision = await this.prisma.client.hrAppendixRevision.findFirst({
      where: { id }
    });

    if (!revision) {
      throw new NotFoundException(`Không tìm thấy appendix revision: ${id}`);
    }

    return revision;
  }

  private async ensurePipCase(id: string) {
    const pipCase = await this.prisma.client.hrPipCase.findFirst({
      where: { id },
      include: {
        sourceSubmission: {
          include: {
            evidences: true,
            revisions: {
              orderBy: { createdAt: 'desc' },
              take: 20
            }
          }
        }
      }
    });

    if (!pipCase) {
      throw new NotFoundException(`Không tìm thấy PIP case: ${id}`);
    }

    return pipCase;
  }

  private requireAppendixCode(value: unknown) {
    const parsed = this.toAppendixCode(value, null);
    if (!parsed) {
      throw new BadRequestException(`appendixCode không hợp lệ. Hỗ trợ: ${APPENDIX_CODE_VALUES.join(', ')}`);
    }
    return parsed;
  }

  private toAppendixCode(value: unknown, fallback: HrAppendixCode | null) {
    const normalized = this.readString(value, null)?.toUpperCase();
    if (!normalized) {
      return fallback;
    }

    const strict = normalized.replace(/\s+/g, '');
    const canonical = strict.startsWith('PL') ? strict : `PL${strict}`;
    if ((Object.values(HrAppendixCode) as string[]).includes(canonical)) {
      return canonical as HrAppendixCode;
    }

    if (fallback !== null) {
      throw new BadRequestException(`appendixCode không hợp lệ: ${value}`);
    }

    return null;
  }

  private toAppendixSubmissionStatus(value: unknown, fallback: HrAppendixSubmissionStatus | null) {
    const normalized = this.readString(value, null)?.toUpperCase();
    if (!normalized) {
      return fallback;
    }

    if ((Object.values(HrAppendixSubmissionStatus) as string[]).includes(normalized)) {
      return normalized as HrAppendixSubmissionStatus;
    }

    throw new BadRequestException(`Trạng thái submission không hợp lệ: ${value}`);
  }

  private toDailyScoreStatus(value: unknown, fallback: HrDailyScoreStatus | null) {
    const normalized = this.readString(value, null)?.toUpperCase();
    if (!normalized) {
      return fallback;
    }

    if ((Object.values(HrDailyScoreStatus) as string[]).includes(normalized)) {
      return normalized as HrDailyScoreStatus;
    }

    throw new BadRequestException(`Trạng thái daily score không hợp lệ: ${value}`);
  }

  private toPipStatus(value: unknown, fallback: HrPipCaseStatus | null) {
    const normalized = this.readString(value, null)?.toUpperCase();
    if (!normalized) {
      return fallback;
    }

    if ((Object.values(HrPipCaseStatus) as string[]).includes(normalized)) {
      return normalized as HrPipCaseStatus;
    }

    throw new BadRequestException(`Trạng thái PIP không hợp lệ: ${value}`);
  }

  private toGenericStatus(value: unknown, fallback: GenericStatus | null) {
    const normalized = this.readString(value, null)?.toUpperCase();
    if (!normalized) {
      return fallback;
    }

    if ((Object.values(GenericStatus) as string[]).includes(normalized)) {
      return normalized as GenericStatus;
    }

    throw new BadRequestException(`Generic status không hợp lệ: ${value}`);
  }

  private toWorkDate(value: unknown, fallback: Date | null) {
    const raw = this.readString(value, null);
    if (!raw) {
      return fallback;
    }

    const normalized = raw.includes('T') ? raw.slice(0, 10) : raw;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      throw new BadRequestException(`workDate không hợp lệ: ${value}`);
    }

    return this.parseIctDateKey(normalized);
  }

  private toDate(value: unknown, fallback: Date | null) {
    if (value === null || value === undefined || value === '') {
      return fallback;
    }
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Ngày không hợp lệ: ${value}`);
    }
    return parsed;
  }

  private readString(value: unknown, fallback: string | null) {
    if (value === null || value === undefined) {
      return fallback;
    }
    const normalized = String(value).trim();
    return normalized ? normalized : fallback;
  }

  private toInt(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
  }

  private toNumber(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toJsonObject(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {} as Record<string, unknown>;
    }
    return value as Record<string, unknown>;
  }

  private toNullableInputJson(value: unknown): Prisma.InputJsonValue | Prisma.NullTypes.DbNull {
    if (value === undefined || value === null) {
      return Prisma.DbNull;
    }
    return value as Prisma.InputJsonValue;
  }

  private clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  private take(limit: number | undefined, max: number) {
    if (!limit || limit <= 0) {
      return Math.min(100, max);
    }
    return Math.min(limit, max);
  }
}
