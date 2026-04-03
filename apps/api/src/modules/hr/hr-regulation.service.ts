import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  GenericStatus,
  HrAppendixCode,
  HrAppendixRevisionStatus,
  HrAppendixSubmissionStatus,
  HrDailyScoreStatus,
  HrPipCaseStatus,
  Prisma
} from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
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

const TZ_OFFSET_MINUTES = 7 * 60;
const APPROVAL_REQUIRED_CODES = new Set<HrAppendixCode>([
  HrAppendixCode.PL04,
  HrAppendixCode.PL05,
  HrAppendixCode.PL06,
  HrAppendixCode.PL10
]);
const DAILY_REQUIRED_CODES: HrAppendixCode[] = [HrAppendixCode.PL01, HrAppendixCode.PL02];
const APPENDIX_CODE_VALUES = Object.values(HrAppendixCode) as string[];

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

@Injectable()
export class HrRegulationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(WorkflowsService) private readonly workflowsService?: WorkflowsService,
    @Optional() @Inject(NotificationsService) private readonly notificationsService?: NotificationsService
  ) {}

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
    const where: Prisma.HrAppendixSubmissionWhereInput = {};

    const appendixCode = this.toAppendixCode(filters.appendixCode ?? filters.code, null);
    if (appendixCode) {
      where.appendixCode = appendixCode;
    }

    const employeeId = this.readString(filters.employeeId, null);
    if (employeeId) {
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

    return this.prisma.client.hrAppendixSubmission.findMany({
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
  }

  async createAppendixSubmission(payload: HrPayload) {
    const appendixCode = this.requireAppendixCode(payload.appendixCode ?? payload.code);
    const employeeId = this.readString(payload.employeeId, null);
    if (!employeeId) {
      throw new BadRequestException('Thiếu employeeId.');
    }

    await this.ensureEmployee(employeeId);

    const workDate = this.toWorkDate(payload.workDate, null);
    const templateId = this.readString(payload.templateId, null);
    const dueAt = this.toDate(payload.dueAt, null) ?? this.computeDefaultDueAt(appendixCode, workDate);

    const submission = await this.prisma.client.hrAppendixSubmission.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        appendixCode,
        templateId,
        employeeId,
        workDate,
        period: this.readString(payload.period, null),
        payloadJson: this.toNullableInputJson(payload.payloadJson ?? payload.payload ?? {}),
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

    if (submission.status !== HrAppendixSubmissionStatus.DRAFT) {
      throw new BadRequestException('Chỉ cho phép chỉnh bản nháp (DRAFT).');
    }

    const appendixCode = this.toAppendixCode(payload.appendixCode ?? payload.code, submission.appendixCode) ?? submission.appendixCode;
    const employeeId = this.readString(payload.employeeId, submission.employeeId);
    if (!employeeId) {
      throw new BadRequestException('Thiếu employeeId.');
    }

    const workDate = payload.workDate !== undefined
      ? this.toWorkDate(payload.workDate, null)
      : submission.workDate;
    const dueAt = payload.dueAt !== undefined
      ? this.toDate(payload.dueAt, null)
      : (submission.dueAt ?? this.computeDefaultDueAt(appendixCode, workDate));

    await this.prisma.client.hrAppendixSubmission.updateMany({
      where: { id },
      data: {
        appendixCode,
        templateId: payload.templateId !== undefined ? this.readString(payload.templateId, null) : undefined,
        employeeId,
        workDate,
        period: payload.period !== undefined ? this.readString(payload.period, null) : undefined,
        payloadJson: payload.payloadJson !== undefined || payload.payload !== undefined
          ? this.toNullableInputJson(payload.payloadJson ?? payload.payload)
          : undefined,
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
    const where: Prisma.HrDailyScoreSnapshotWhereInput = {};
    const employeeId = this.readString(filters.employeeId, null);
    if (employeeId) {
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

    return this.prisma.client.hrDailyScoreSnapshot.findMany({
      where,
      orderBy: [{ workDate: 'desc' }, { employeeId: 'asc' }],
      take: this.take(query.limit, 500)
    });
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
    const where: Prisma.HrPipCaseWhereInput = {};

    const normalizedEmployeeId = this.readString(employeeId, null);
    if (normalizedEmployeeId) {
      where.employeeId = normalizedEmployeeId;
    }

    const normalizedStatus = this.toPipStatus(status, null);
    if (normalizedStatus) {
      where.status = normalizedStatus;
    }

    return this.prisma.client.hrPipCase.findMany({
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
  }

  async createPipCase(payload: HrPayload) {
    const employeeId = this.readString(payload.employeeId, null);
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
