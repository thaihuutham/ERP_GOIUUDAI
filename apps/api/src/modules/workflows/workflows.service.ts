import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GenericStatus, Prisma, UserRole } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { AUTH_USER_CONTEXT_KEY } from '../../common/request/request.constants';
import { AuthUser } from '../../common/auth/auth-user.type';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SearchService } from '../search/search.service';
import {
  CreateApprovalDto,
  CreateWorkflowDefinitionDto,
  CreateWorkflowInstanceDto,
  DelegateWorkflowDto,
  EscalateWorkflowDto,
  ReassignWorkflowDto,
  SubmitWorkflowDto,
  UpdateApprovalDto,
  UpdateWorkflowDefinitionDto,
  UpdateWorkflowInstanceDto,
  WorkflowDefinitionSimulateDto,
  WorkflowDecisionDto,
  WorkflowsListQueryDto
} from './dto/workflows.dto';

type WorkflowActionType =
  | 'SUBMIT'
  | 'APPROVE'
  | 'REJECT'
  | 'CANCEL'
  | 'REASSIGN'
  | 'DELEGATE'
  | 'ESCALATE'
  | 'PUBLISH'
  | 'ARCHIVE'
  | 'AUTO_ESCALATE';
type WorkflowDecisionAction = 'APPROVE' | 'REJECT' | 'CANCEL';
type WorkflowConditionOperator = 'EQ' | 'NEQ' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'IN' | 'NOT_IN';
type WorkflowApprovalMode = 'ANY' | 'ALL' | 'MIN_N';

type DecisionActor = {
  actorId: string | null;
  role: UserRole | null;
  email: string | null;
  employeeId: string | null;
  source: 'auth' | 'legacy' | 'none';
};

type WorkflowCondition = {
  field: string;
  operator?: WorkflowConditionOperator;
  value: unknown;
};

type WorkflowTransitionRule = {
  action?: string;
  toStep?: string;
  terminalStatus?: GenericStatus | string;
  condition?: WorkflowCondition;
};

type WorkflowApproverRule = {
  type?: 'USER' | 'ROLE' | 'DEPARTMENT' | 'VALUE_RULE' | string;
  userId?: string;
  approverId?: string;
  role?: UserRole | string;
  departmentId?: string;
  field?: string;
  minValue?: number;
  maxValue?: number;
};

type WorkflowStep = {
  key: string;
  name?: string;
  slaHours?: number;
  approvalMode?: WorkflowApprovalMode;
  minApprovers?: number;
  escalationPolicy?: {
    slaHours?: number;
    escalateToRole?: string;
  };
  autoApprove?: boolean;
  approvers?: WorkflowApproverRule[];
  transitions?: WorkflowTransitionRule[];
};

type WorkflowDefinitionGraph = {
  initialStep?: string;
  steps: WorkflowStep[];
};

const WORKFLOW_ACTIONS = {
  SUBMIT: 'SUBMIT' as WorkflowActionType,
  APPROVE: 'APPROVE' as WorkflowActionType,
  REJECT: 'REJECT' as WorkflowActionType,
  CANCEL: 'CANCEL' as WorkflowActionType,
  REASSIGN: 'REASSIGN' as WorkflowActionType,
  DELEGATE: 'DELEGATE' as WorkflowActionType,
  ESCALATE: 'ESCALATE' as WorkflowActionType,
  PUBLISH: 'PUBLISH' as WorkflowActionType,
  ARCHIVE: 'ARCHIVE' as WorkflowActionType,
  AUTO_ESCALATE: 'AUTO_ESCALATE' as WorkflowActionType
};

const TERMINAL_STATUSES: GenericStatus[] = [
  GenericStatus.APPROVED,
  GenericStatus.REJECTED,
  GenericStatus.ARCHIVED,
  GenericStatus.INACTIVE
];

@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RuntimeSettingsService) private readonly runtimeSettings: RuntimeSettingsService,
    @Inject(ClsService) private readonly cls: ClsService,
    @Inject(SearchService) private readonly search: SearchService
  ) {}

  async listDefinitions(query: WorkflowsListQueryDto) {
    return this.prisma.client.workflowDefinition.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.module ? { module: query.module } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });
  }

  async createDefinition(body: CreateWorkflowDefinitionDto) {
    this.parseDefinitionGraph(body.definitionJson);

    return this.prisma.client.workflowDefinition.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        code: body.code ?? null,
        name: body.name,
        module: body.module,
        version: body.version ?? 1,
        description: body.description ?? null,
        definitionJson: this.toInputJson(body.definitionJson),
        status: body.status ?? GenericStatus.DRAFT
      }
    });
  }

  async updateDefinition(id: string, body: UpdateWorkflowDefinitionDto) {
    await this.ensureDefinition(id);
    if (body.definitionJson) {
      this.parseDefinitionGraph(body.definitionJson);
    }

    await this.prisma.client.workflowDefinition.updateMany({
      where: { id },
      data: {
        code: body.code,
        name: body.name,
        module: body.module,
        version: body.version,
        description: body.description,
        definitionJson: body.definitionJson ? this.toInputJson(body.definitionJson) : undefined,
        status: body.status
      }
    });

    return this.ensureDefinition(id);
  }

  async validateDefinition(id: string) {
    const definition = await this.ensureDefinition(id);
    const graph = this.parseDefinitionGraph(definition.definitionJson);

    const steps = graph.steps.map((step) => ({
      key: step.key,
      approvalMode: this.resolveApprovalMode(step),
      minApprovers: this.normalizeMinApprovers(step.minApprovers),
      transitions: (step.transitions ?? []).map((transition) => ({
        action: String(transition.action ?? '').toUpperCase() || null,
        toStep: transition.toStep ?? null,
        terminalStatus: transition.terminalStatus ?? null
      }))
    }));

    return {
      definitionId: definition.id,
      valid: true,
      summary: {
        initialStep: this.getInitialStep(graph).key,
        stepsCount: graph.steps.length,
        transitionsCount: graph.steps.reduce((sum, step) => sum + (step.transitions?.length ?? 0), 0),
        steps
      }
    };
  }

  async simulateDefinition(id: string, body: WorkflowDefinitionSimulateDto) {
    const definition = await this.ensureDefinition(id);
    const graph = this.parseDefinitionGraph(definition.definitionJson);
    const context = (body.contextJson ?? {}) as Record<string, unknown>;
    const actions = Array.isArray(body.actions)
      ? body.actions.map((action) => String(action ?? '').trim().toUpperCase()).filter(Boolean)
      : [];

    let current = this.getInitialStep(graph);
    const path: Array<Record<string, unknown>> = [
      {
        step: current.key,
        action: null,
        result: 'ENTER'
      }
    ];

    for (const action of actions) {
      const transition = this.pickTransition(current, action as WorkflowDecisionAction, context);
      if (!transition) {
        path.push({
          step: current.key,
          action,
          result: 'NO_MATCH'
        });
        return {
          definitionId: definition.id,
          success: false,
          currentStep: current.key,
          path
        };
      }

      if (transition.toStep) {
        current = this.findStep(graph, transition.toStep);
        path.push({
          step: current.key,
          action,
          result: 'MOVED'
        });
        continue;
      }

      const terminalStatus = this.resolveTerminalStatus(
        transition.terminalStatus,
        action as WorkflowDecisionAction
      );
      path.push({
        step: current.key,
        action,
        result: 'TERMINAL',
        terminalStatus
      });
      return {
        definitionId: definition.id,
        success: true,
        terminalStatus,
        path
      };
    }

    return {
      definitionId: definition.id,
      success: true,
      currentStep: current.key,
      availableActions: Array.from(
        new Set((current.transitions ?? []).map((item) => String(item.action ?? '').toUpperCase()).filter(Boolean))
      ),
      path
    };
  }

  async publishDefinition(id: string) {
    const definition = await this.ensureDefinition(id);
    this.parseDefinitionGraph(definition.definitionJson);

    await this.prisma.client.workflowDefinition.updateMany({
      where: { id },
      data: {
        status: GenericStatus.ACTIVE
      }
    });

    return this.ensureDefinition(id);
  }

  async archiveDefinition(id: string) {
    await this.ensureDefinition(id);
    await this.prisma.client.workflowDefinition.updateMany({
      where: { id },
      data: {
        status: GenericStatus.ARCHIVED
      }
    });

    return this.ensureDefinition(id);
  }

  async listInstances(query: WorkflowsListQueryDto) {
    return this.prisma.client.workflowInstance.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.definitionId ? { definitionId: query.definitionId } : {}),
        ...(query.targetType ? { targetType: query.targetType } : {})
      },
      include: {
        definition: true,
        approvals: {
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });
  }

  async getInstanceDetail(id: string) {
    const instance = await this.prisma.client.workflowInstance.findFirst({
      where: { id },
      include: {
        definition: true,
        approvals: { orderBy: { createdAt: 'asc' } },
        actionLogs: { orderBy: { createdAt: 'asc' } }
      }
    });

    if (!instance) {
      throw new NotFoundException(`Workflow instance not found: ${id}`);
    }

    return instance;
  }

  async createInstance(body: CreateWorkflowInstanceDto) {
    await this.ensureDefinition(body.definitionId);

    return this.prisma.client.workflowInstance.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        definitionId: body.definitionId,
        targetType: body.targetType,
        targetId: body.targetId,
        currentStep: body.currentStep ?? null,
        status: body.status ?? GenericStatus.DRAFT,
        startedBy: body.startedBy ?? null,
        contextJson: this.toInputJson(body.contextJson)
      }
    });
  }

  async updateInstance(id: string, body: UpdateWorkflowInstanceDto) {
    await this.ensureInstance(id);
    await this.prisma.client.workflowInstance.updateMany({
      where: { id },
      data: {
        currentStep: body.currentStep,
        status: body.status,
        contextJson: body.contextJson ? this.toInputJson(body.contextJson) : undefined
      }
    });

    return this.getInstanceDetail(id);
  }

  async submitInstance(body: SubmitWorkflowDto) {
    const definition = await this.ensureDefinition(body.definitionId);
    if (definition.status !== GenericStatus.ACTIVE) {
      throw new BadRequestException(`Workflow definition ${definition.id} chưa ở trạng thái ACTIVE.`);
    }
    const graph = this.parseDefinitionGraph(definition.definitionJson);
    const initialStep = this.getInitialStep(graph);
    const actor = await this.resolveDecisionActor(body.requestedBy);
    const requestedBy = actor.actorId ?? body.requestedBy ?? 'SYSTEM';

    const context = {
      ...(body.contextJson ?? {}),
      requestedBy,
      requestedByRole: actor.role ?? null,
      requestedByEmployeeId: actor.employeeId ?? null
    };

    const submittedAt = new Date();
    const instance = await this.prisma.client.workflowInstance.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        definitionId: definition.id,
        targetType: body.targetType,
        targetId: body.targetId,
        currentStep: initialStep.key,
        status: GenericStatus.PENDING,
        startedBy: requestedBy,
        contextJson: this.toInputJson(context),
        submittedAt
      }
    });

    await this.createActionLog(instance.id, WORKFLOW_ACTIONS.SUBMIT, {
      actorId: requestedBy,
      fromStep: null,
      toStep: initialStep.key,
      note: 'Workflow submitted',
      metadata: {
        definitionId: definition.id,
        module: definition.module
      }
    });

    await this.ensureStepApprovals(instance, graph, initialStep, requestedBy, 0);
    return this.getInstanceDetail(instance.id);
  }

  async approveInstance(instanceId: string, body: WorkflowDecisionDto) {
    const instance = await this.ensureInstance(instanceId);
    this.assertPendingInstance(instance);
    const actor = await this.resolveDecisionActor(body.actorId);
    if (!actor.actorId) {
      throw new ForbiddenException('Thiếu thông tin người duyệt.');
    }

    const definition = await this.ensureDefinition(instance.definitionId);
    const graph = this.parseDefinitionGraph(definition.definitionJson);

    const currentStepKey = this.getCurrentStep(instance);
    const currentStep = this.findStep(graph, currentStepKey);
    const approval = await this.pickPendingApproval(instance.id, currentStepKey, body.approvalId, actor);
    this.assertSeparationOfDuties(approval, actor);

    const decidedAt = new Date();
    await this.prisma.client.approval.updateMany({
      where: { id: approval.id },
      data: {
        status: GenericStatus.APPROVED,
        decidedAt,
        decisionNote: body.note,
        decisionActorId: actor.actorId
      }
    });

    const stepApprovals = await this.prisma.client.approval.findMany({
      where: {
        instanceId: instance.id,
        stepKey: currentStepKey
      }
    });

    const approvalGate = this.resolveApprovalGate(currentStep, stepApprovals.length);
    const approvedCount = stepApprovals.filter((item) => item.status === GenericStatus.APPROVED).length;
    const pendingApprovals = stepApprovals.filter((item) => item.status === GenericStatus.PENDING);

    if (approvedCount < approvalGate.requiredApprovals) {
      await this.createActionLog(instance.id, WORKFLOW_ACTIONS.APPROVE, {
        actorId: actor.actorId,
        fromStep: currentStepKey,
        toStep: currentStepKey,
        note: body.note ?? 'Step partially approved',
        metadata: {
          approvalId: approval.id,
          remainingApprovals: pendingApprovals.length,
          approvedCount,
          requiredApprovals: approvalGate.requiredApprovals,
          approvalMode: approvalGate.mode
        }
      });
      return this.getInstanceDetail(instance.id);
    }

    if (pendingApprovals.length > 0) {
      await this.prisma.client.approval.updateMany({
        where: {
          instanceId: instance.id,
          stepKey: currentStepKey,
          status: GenericStatus.PENDING
        },
        data: {
          status: GenericStatus.ARCHIVED,
          decidedAt,
          decisionNote: this.mergeNote(body.note, `Skipped by policy ${approvalGate.mode}`),
          decisionActorId: actor.actorId
        }
      });
    }

    await this.advanceByDecision(instance.id, 'APPROVE', actor.actorId, body.note ?? null);
    return this.getInstanceDetail(instance.id);
  }

  async rejectInstance(instanceId: string, body: WorkflowDecisionDto) {
    const instance = await this.ensureInstance(instanceId);
    this.assertPendingInstance(instance);
    const actor = await this.resolveDecisionActor(body.actorId);
    if (!actor.actorId) {
      throw new ForbiddenException('Thiếu thông tin người duyệt.');
    }

    const currentStepKey = this.getCurrentStep(instance);
    const approval = await this.pickPendingApproval(instance.id, currentStepKey, body.approvalId, actor);
    this.assertSeparationOfDuties(approval, actor);

    const now = new Date();
    await this.prisma.client.approval.updateMany({
      where: {
        instanceId: instance.id,
        stepKey: currentStepKey,
        status: GenericStatus.PENDING
      },
      data: {
        status: GenericStatus.REJECTED,
        decidedAt: now,
        decisionNote: body.note ?? 'Rejected by workflow decision',
        decisionActorId: actor.actorId
      }
    });

    await this.prisma.client.approval.updateMany({
      where: { id: approval.id },
      data: {
        status: GenericStatus.REJECTED,
        decidedAt: now,
        decisionNote: body.note,
        decisionActorId: actor.actorId
      }
    });

    await this.advanceByDecision(instance.id, 'REJECT', actor.actorId, body.note ?? null);
    return this.getInstanceDetail(instance.id);
  }

  async cancelInstance(instanceId: string, body: WorkflowDecisionDto) {
    const instance = await this.ensureInstance(instanceId);
    const actor = await this.resolveDecisionActor(body.actorId);
    if (TERMINAL_STATUSES.includes(instance.status)) {
      throw new BadRequestException(`Workflow instance already terminal: ${instance.status}`);
    }

    const now = new Date();
    await this.prisma.client.approval.updateMany({
      where: {
        instanceId: instance.id,
        status: GenericStatus.PENDING
      },
      data: {
        status: GenericStatus.REJECTED,
        decidedAt: now,
        decisionNote: body.note ?? 'Cancelled',
        decisionActorId: actor.actorId
      }
    });

    await this.prisma.client.workflowInstance.updateMany({
      where: { id: instance.id },
      data: {
        status: GenericStatus.ARCHIVED,
        cancelledAt: now,
        completedAt: now
      }
    });

    await this.createActionLog(instance.id, WORKFLOW_ACTIONS.CANCEL, {
      actorId: actor.actorId,
      fromStep: instance.currentStep,
      toStep: null,
      note: body.note ?? 'Workflow cancelled'
    });

    return this.getInstanceDetail(instance.id);
  }

  async reassignInstance(instanceId: string, body: ReassignWorkflowDto) {
    const instance = await this.ensureInstance(instanceId);
    this.assertPendingInstance(instance);
    const actor = await this.resolveDecisionActor(body.actorId);
    if (!actor.actorId) {
      throw new ForbiddenException('Thiếu thông tin người xử lý.');
    }

    const currentStepKey = this.getCurrentStep(instance);
    const approval = await this.pickPendingApproval(instance.id, currentStepKey, body.approvalId, actor);
    this.assertSeparationOfDuties(approval, actor);
    const replacement = await this.resolveSingleApprover(body.toApproverId, actor);

    await this.prisma.client.approval.updateMany({
      where: { id: approval.id },
      data: {
        approverId: replacement.approverId,
        assignmentType: replacement.assignmentType,
        assignmentSource: replacement.assignmentSource,
        resolutionMetaJson: this.toInputJson({
          reassignedBy: actor.actorId,
          reassignedAt: new Date().toISOString()
        }),
        decisionNote: this.mergeNote(approval.decisionNote, body.note),
        decisionActorId: actor.actorId
      }
    });

    await this.createActionLog(instance.id, WORKFLOW_ACTIONS.REASSIGN, {
      actorId: actor.actorId,
      fromStep: currentStepKey,
      toStep: currentStepKey,
      note: body.note ?? `Reassigned to ${replacement.approverId}`,
      metadata: {
        approvalId: approval.id,
        fromApproverId: approval.approverId,
        toApproverId: replacement.approverId,
        requestedTarget: body.toApproverId
      }
    });

    return this.getInstanceDetail(instance.id);
  }

  async delegateInstance(instanceId: string, body: DelegateWorkflowDto) {
    const instance = await this.ensureInstance(instanceId);
    this.assertPendingInstance(instance);
    const actor = await this.resolveDecisionActor(body.actorId);
    if (!actor.actorId) {
      throw new ForbiddenException('Thiếu thông tin người xử lý.');
    }
    const approvalPolicy = await this.runtimeSettings.getApprovalMatrixRuntime();

    if (approvalPolicy.delegation.enabled === false) {
      throw new BadRequestException('Tính năng delegation đang tắt theo approval_matrix.delegation.enabled.');
    }

    const currentStepKey = this.getCurrentStep(instance);
    const approval = await this.pickPendingApproval(instance.id, currentStepKey, body.approvalId, actor);
    this.assertSeparationOfDuties(approval, actor);
    const delegateTarget = await this.resolveSingleApprover(body.toApproverId, actor);

    if (approval.delegatedAt) {
      const maxMs = Number(approvalPolicy.delegation.maxDays || 14) * 24 * 60 * 60 * 1000;
      if (Date.now() - approval.delegatedAt.getTime() > maxMs) {
        throw new BadRequestException('Không thể delegate: đã vượt quá approval_matrix.delegation.maxDays.');
      }
    }

    await this.prisma.client.approval.updateMany({
      where: { id: approval.id },
      data: {
        approverId: delegateTarget.approverId,
        assignmentType: delegateTarget.assignmentType,
        assignmentSource: delegateTarget.assignmentSource,
        delegatedTo: delegateTarget.approverId,
        delegatedAt: new Date(),
        decisionActorId: actor.actorId,
        decisionNote: this.mergeNote(approval.decisionNote, body.note)
      }
    });

    await this.createActionLog(instance.id, WORKFLOW_ACTIONS.DELEGATE, {
      actorId: actor.actorId,
      fromStep: currentStepKey,
      toStep: currentStepKey,
      note: body.note ?? `Delegated to ${delegateTarget.approverId}`,
      metadata: {
        approvalId: approval.id,
        fromApproverId: approval.approverId,
        toApproverId: delegateTarget.approverId,
        requestedTarget: body.toApproverId
      }
    });

    return this.getInstanceDetail(instance.id);
  }

  async escalateInstance(instanceId: string, body: EscalateWorkflowDto) {
    const instance = await this.ensureInstance(instanceId);
    this.assertPendingInstance(instance);
    const actor = await this.resolveDecisionActor(body.actorId);
    if (!actor.actorId) {
      throw new ForbiddenException('Thiếu thông tin người xử lý.');
    }
    const approvalPolicy = await this.runtimeSettings.getApprovalMatrixRuntime();

    if (approvalPolicy.escalation.enabled === false) {
      throw new BadRequestException('Tính năng escalation đang tắt theo approval_matrix.escalation.enabled.');
    }

    const expectedEscalateRole = String(approvalPolicy.escalation.escalateToRole || '').toUpperCase();
    if (body.escalatedTo.toUpperCase().startsWith('ROLE:')) {
      const roleToken = body.escalatedTo.toUpperCase().slice('ROLE:'.length);
      if (expectedEscalateRole && roleToken !== expectedEscalateRole) {
        throw new BadRequestException(
          `Escalate target role '${roleToken}' không khớp policy escalateToRole='${expectedEscalateRole}'.`
        );
      }
    }

    const currentStepKey = this.getCurrentStep(instance);
    const approval = await this.pickPendingApproval(instance.id, currentStepKey, body.approvalId, actor);
    this.assertSeparationOfDuties(approval, actor);
    const escalationTarget = await this.resolveSingleApprover(body.escalatedTo, actor, {
      preferRole: expectedEscalateRole || undefined
    });

    await this.prisma.client.approval.updateMany({
      where: {
        id: approval.id,
        status: GenericStatus.PENDING
      },
      data: {
        approverId: escalationTarget.approverId,
        assignmentType: escalationTarget.assignmentType,
        assignmentSource: escalationTarget.assignmentSource,
        escalatedTo: body.escalatedTo,
        escalatedAt: new Date(),
        escalationCount: {
          increment: 1
        },
        decisionActorId: actor.actorId,
        decisionNote: this.mergeNote(approval.decisionNote, body.note)
      }
    });

    await this.createActionLog(instance.id, WORKFLOW_ACTIONS.ESCALATE, {
      actorId: actor.actorId,
      fromStep: currentStepKey,
      toStep: currentStepKey,
      note: body.note ?? `Escalated to ${escalationTarget.approverId}`,
      metadata: {
        approvalId: approval.id,
        fromApproverId: approval.approverId,
        toApproverId: escalationTarget.approverId,
        requestedTarget: body.escalatedTo
      }
    });

    return this.getInstanceDetail(instance.id);
  }

  async listInstanceTimeline(instanceId: string) {
    await this.ensureInstance(instanceId);
    return this.prisma.client.workflowActionLog.findMany({
      where: { instanceId },
      orderBy: { createdAt: 'asc' }
    });
  }

  async listInstanceApprovals(instanceId: string) {
    await this.ensureInstance(instanceId);
    return this.prisma.client.approval.findMany({
      where: { instanceId },
      orderBy: { createdAt: 'asc' }
    });
  }

  async listInbox(query: WorkflowsListQueryDto) {
    const actor = await this.resolveDecisionActor(query.approverId);
    if (!actor.actorId) {
      throw new ForbiddenException('Không xác định được người duyệt hiện tại.');
    }

    const legacyApproverTokens = await this.deriveLegacyApproverTokens(actor);
    const where: Prisma.ApprovalWhereInput = {
      status: GenericStatus.PENDING,
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.definitionId
        ? {
            instance: {
              definitionId: query.definitionId
            }
          }
        : {}),
      OR: [
        { approverId: actor.actorId },
        ...legacyApproverTokens.map((token) => ({ approverId: token }))
      ]
    };

    return this.prisma.client.approval.findMany({
      where,
      include: {
        instance: {
          include: {
            definition: true
          }
        }
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
      take: this.take(query.limit)
    });
  }

  async listRequests(query: WorkflowsListQueryDto) {
    const actor = await this.resolveDecisionActor(query.requesterId);
    if (!actor.actorId) {
      throw new ForbiddenException('Không xác định được người gửi yêu cầu hiện tại.');
    }

    return this.prisma.client.workflowInstance.findMany({
      where: {
        startedBy: actor.actorId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.targetType ? { targetType: query.targetType } : {}),
        ...(query.definitionId ? { definitionId: query.definitionId } : {})
      },
      include: {
        definition: true,
        approvals: {
          orderBy: { createdAt: 'asc' }
        },
        actionLogs: {
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });
  }

  async listApprovals(query: WorkflowsListQueryDto) {
    return this.prisma.client.approval.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.targetType ? { targetType: query.targetType } : {}),
        ...(query.approverId ? { approverId: query.approverId } : {}),
        ...(query.requesterId ? { requesterId: query.requesterId } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });
  }

  async approveTask(taskId: string, body: WorkflowDecisionDto) {
    const approval = await this.ensureApproval(taskId);
    if (!approval.instanceId) {
      throw new BadRequestException('Task không thuộc workflow instance.');
    }
    return this.approveInstance(approval.instanceId, {
      ...body,
      approvalId: taskId
    });
  }

  async rejectTask(taskId: string, body: WorkflowDecisionDto) {
    const approval = await this.ensureApproval(taskId);
    if (!approval.instanceId) {
      throw new BadRequestException('Task không thuộc workflow instance.');
    }
    return this.rejectInstance(approval.instanceId, {
      ...body,
      approvalId: taskId
    });
  }

  async delegateTask(taskId: string, body: DelegateWorkflowDto) {
    const approval = await this.ensureApproval(taskId);
    if (!approval.instanceId) {
      throw new BadRequestException('Task không thuộc workflow instance.');
    }
    return this.delegateInstance(approval.instanceId, {
      ...body,
      approvalId: taskId
    });
  }

  async reassignTask(taskId: string, body: ReassignWorkflowDto) {
    const approval = await this.ensureApproval(taskId);
    if (!approval.instanceId) {
      throw new BadRequestException('Task không thuộc workflow instance.');
    }
    return this.reassignInstance(approval.instanceId, {
      ...body,
      approvalId: taskId
    });
  }

  async createApproval(body: CreateApprovalDto) {
    if (body.instanceId) {
      await this.ensureInstance(body.instanceId);
    }

    const actor = await this.resolveDecisionActor(body.approverId);
    const resolvedApprover = body.approverId
      ? await this.resolveSingleApprover(body.approverId, actor, { allowUnresolvedUserId: true })
      : null;

    return this.prisma.client.approval.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        instanceId: body.instanceId ?? null,
        targetType: body.targetType,
        targetId: body.targetId,
        requesterId: body.requesterId,
        approverId: resolvedApprover?.approverId ?? body.approverId ?? null,
        assignmentType: resolvedApprover?.assignmentType ?? 'USER',
        assignmentSource: resolvedApprover?.assignmentSource ?? body.approverId ?? null,
        stepKey: body.stepKey ?? null,
        contextJson: this.toInputJson(body.contextJson),
        dueAt: body.dueAt ? this.parseDate(body.dueAt, 'dueAt') : null,
        status: body.status ?? GenericStatus.PENDING
      }
    });
  }

  async updateApproval(id: string, body: UpdateApprovalDto) {
    await this.ensureApproval(id);
    const actor = await this.resolveDecisionActor(body.approverId);
    const resolvedApprover = body.approverId
      ? await this.resolveSingleApprover(body.approverId, actor, { allowUnresolvedUserId: true })
      : null;

    await this.prisma.client.approval.updateMany({
      where: { id },
      data: {
        approverId: resolvedApprover?.approverId ?? body.approverId,
        assignmentType: resolvedApprover?.assignmentType ?? undefined,
        assignmentSource: resolvedApprover?.assignmentSource ?? undefined,
        dueAt: body.dueAt ? this.parseDate(body.dueAt, 'dueAt') : undefined,
        decidedAt: body.decidedAt ? this.parseDate(body.decidedAt, 'decidedAt') : undefined,
        decisionNote: body.decisionNote,
        status: body.status
      }
    });

    return this.ensureApproval(id);
  }

  private async advanceByDecision(instanceId: string, action: WorkflowDecisionAction, actorId: string | null, note: string | null) {
    const instance = await this.ensureInstance(instanceId);
    const definition = await this.ensureDefinition(instance.definitionId);
    const graph = this.parseDefinitionGraph(definition.definitionJson);
    const currentStep = this.findStep(graph, this.getCurrentStep(instance));

    const transition = this.pickTransition(currentStep, action, instance.contextJson as Record<string, unknown> | null);

    if (transition?.toStep) {
      const nextStep = this.findStep(graph, transition.toStep);

      await this.prisma.client.workflowInstance.updateMany({
        where: { id: instance.id },
        data: {
          currentStep: nextStep.key,
          status: GenericStatus.PENDING
        }
      });

      await this.createActionLog(instance.id, action as WorkflowActionType, {
        actorId,
        fromStep: currentStep.key,
        toStep: nextStep.key,
        note,
        metadata: {
          transition: transition.toStep
        }
      });

      const updatedInstance = await this.ensureInstance(instance.id);
      await this.ensureStepApprovals(updatedInstance, graph, nextStep, updatedInstance.startedBy ?? actorId, 0);
      return;
    }

    const terminalStatus = this.resolveTerminalStatus(transition?.terminalStatus, action);
    const now = new Date();
    await this.prisma.client.workflowInstance.updateMany({
      where: { id: instance.id },
      data: {
        status: terminalStatus,
        completedAt: now,
        cancelledAt: action === 'CANCEL' ? now : undefined
      }
    });

    await this.createActionLog(instance.id, action as WorkflowActionType, {
      actorId,
      fromStep: currentStep.key,
      toStep: null,
      note,
      metadata: {
        terminalStatus
      }
    });

    await this.syncTargetAfterWorkflowDecision(instance, terminalStatus);
  }

  private async ensureStepApprovals(
    instance: { id: string; targetType: string; targetId: string; contextJson: Prisma.JsonValue | null; startedBy: string | null },
    graph: WorkflowDefinitionGraph,
    step: WorkflowStep,
    requesterId: string | null,
    depth: number
  ) {
    if (depth > 20) {
      throw new BadRequestException('Workflow graph depth exceeded safe limit (20).');
    }

    const context = (instance.contextJson as Record<string, unknown> | null) ?? null;
    let approvers = this.resolveApprovers(step, context);
    const approvalPolicy = await this.runtimeSettings.getApprovalMatrixRuntime();

    if (approvers.length === 0) {
      approvers = this.resolveApproversByMatrix(instance.targetType, context, approvalPolicy);
    }

    const normalizedAssignments = await this.normalizeApproverAssignments(approvers);
    const approvalGate = this.resolveApprovalGate(step, normalizedAssignments.length);

    if (approvers.length === 0) {
      if (step.autoApprove) {
        await this.advanceByDecision(instance.id, 'APPROVE', requesterId, `Auto-approved step ${step.key}`);
        return;
      }
      throw new BadRequestException(`No approvers resolved for workflow step: ${step.key}`);
    }

    if (normalizedAssignments.length === 0) {
      if (step.autoApprove) {
        await this.advanceByDecision(instance.id, 'APPROVE', requesterId, `Auto-approved step ${step.key} (no resolved assignee)`);
        return;
      }
      throw new BadRequestException(`No concrete approver resolved for workflow step: ${step.key}`);
    }

    const effectiveSlaHours =
      step.escalationPolicy?.slaHours
      ?? step.slaHours
      ?? (approvalPolicy.escalation.enabled ? approvalPolicy.escalation.slaHours : undefined);
    const dueAt = this.computeDueAt(effectiveSlaHours);
    await this.prisma.client.approval.createMany({
      data: normalizedAssignments.map((assignment) => ({
        tenant_Id: this.prisma.getTenantId(),
        instanceId: instance.id,
        targetType: instance.targetType,
        targetId: instance.targetId,
        requesterId: requesterId ?? 'SYSTEM',
        approverId: assignment.approverId,
        assignmentType: assignment.assignmentType,
        assignmentSource: assignment.assignmentSource,
        stepKey: step.key,
        approvalMode: approvalGate.mode,
        requiredApprovals: approvalGate.requiredApprovals,
        contextJson: this.toInputJson(context),
        resolutionMetaJson: this.toInputJson({
          resolvedAt: new Date().toISOString(),
          resolvedApproverCount: normalizedAssignments.length
        }),
        dueAt,
        escalatedTo: step.escalationPolicy?.escalateToRole
          ?? (approvalPolicy.escalation.enabled ? approvalPolicy.escalation.escalateToRole : null),
        status: GenericStatus.PENDING
      }))
    });
  }

  private resolveApproversByMatrix(
    targetType: string,
    context: Record<string, unknown> | null,
    policy: { rules: Array<{ module: string; minAmount: number; approverRole: string }> }
  ) {
    const moduleKey = this.mapTargetTypeToModule(targetType);
    if (!moduleKey) return [];

    const amount = Number(this.getFieldValue(context, 'amount') ?? this.getFieldValue(context, 'totalAmount') ?? 0);
    const matchedRules = policy.rules
      .filter((rule) => rule.module === moduleKey && amount >= Number(rule.minAmount ?? 0))
      .sort((a, b) => Number(b.minAmount ?? 0) - Number(a.minAmount ?? 0));

    const topRule = matchedRules[0];
    if (!topRule?.approverRole) {
      return [];
    }
    return [`ROLE:${String(topRule.approverRole).toUpperCase()}`];
  }

  private mapTargetTypeToModule(targetType: string) {
    const normalized = String(targetType || '').trim().toLowerCase();
    if (!normalized) return null;
    if (normalized.includes('order')) return 'sales';
    if (normalized.includes('invoice') || normalized.includes('journal') || normalized.includes('payment')) return 'finance';
    if (normalized.includes('purchase') || normalized.includes('shipment') || normalized.includes('scm')) return 'scm';
    if (normalized.includes('leave') || normalized.includes('payroll') || normalized.includes('hr')) return 'hr';
    return normalized;
  }

  private resolveApprovers(step: WorkflowStep, context: Record<string, unknown> | null): string[] {
    const result: string[] = [];

    for (const rule of step.approvers ?? []) {
      const type = (rule.type ?? '').toUpperCase();
      if (type === 'USER') {
        const value = rule.userId ?? rule.approverId;
        if (value) {
          result.push(value);
        }
        continue;
      }

      if (type === 'ROLE') {
        const value = rule.role ? `ROLE:${String(rule.role).toUpperCase()}` : null;
        if (value) {
          result.push(value);
        }
        continue;
      }

      if (type === 'DEPARTMENT') {
        const value = rule.departmentId ? `DEPT:${rule.departmentId}` : null;
        if (value) {
          result.push(value);
        }
        continue;
      }

      if (type === 'VALUE_RULE') {
        const field = rule.field ?? 'amount';
        const rawValue = this.getFieldValue(context, field);
        const numericValue = Number(rawValue);
        if (!Number.isFinite(numericValue)) {
          continue;
        }

        if (rule.minValue !== undefined && numericValue < rule.minValue) {
          continue;
        }
        if (rule.maxValue !== undefined && numericValue > rule.maxValue) {
          continue;
        }

        const approver = rule.approverId
          ?? (rule.userId ? rule.userId : null)
          ?? (rule.role ? `ROLE:${String(rule.role).toUpperCase()}` : null);
        if (approver) {
          result.push(approver);
        }
      }
    }

    return [...new Set(result.filter(Boolean))];
  }

  private parseDefinitionGraph(raw: unknown): WorkflowDefinitionGraph {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new BadRequestException('Workflow definitionJson must be an object.');
    }

    const graph = raw as WorkflowDefinitionGraph;
    if (!Array.isArray(graph.steps) || graph.steps.length === 0) {
      throw new BadRequestException('Workflow definitionJson.steps must be a non-empty array.');
    }

    const keys = new Set<string>();
    for (const step of graph.steps) {
      if (!step || typeof step !== 'object' || !step.key || typeof step.key !== 'string') {
        throw new BadRequestException('Each workflow step must include a string key.');
      }
      if (keys.has(step.key)) {
        throw new BadRequestException(`Duplicated workflow step key: ${step.key}`);
      }
      keys.add(step.key);

      const mode = this.resolveApprovalMode(step);
      if (mode === 'MIN_N') {
        const minApprovers = this.normalizeMinApprovers(step.minApprovers);
        if (!minApprovers || minApprovers <= 0) {
          throw new BadRequestException(`Step ${step.key} requires minApprovers > 0 when approvalMode=MIN_N.`);
        }
      }
    }

    if (graph.initialStep && !keys.has(graph.initialStep)) {
      throw new BadRequestException(`initialStep not found in steps: ${graph.initialStep}`);
    }

    for (const step of graph.steps) {
      for (const transition of step.transitions ?? []) {
        if (transition.toStep && !keys.has(transition.toStep)) {
          throw new BadRequestException(`Transition toStep not found: ${transition.toStep}`);
        }
      }
    }

    return graph;
  }

  private pickTransition(
    step: WorkflowStep,
    action: WorkflowDecisionAction,
    context: Record<string, unknown> | null
  ): WorkflowTransitionRule | null {
    const transitions = step.transitions ?? [];
    const candidates = transitions.filter((item) => (item.action ?? '').toUpperCase() === action);

    for (const candidate of candidates) {
      if (!candidate.condition || this.evaluateCondition(candidate.condition, context)) {
        return candidate;
      }
    }

    return null;
  }

  private evaluateCondition(condition: WorkflowCondition, context: Record<string, unknown> | null): boolean {
    const left = this.getFieldValue(context, condition.field);
    const right = condition.value;
    const op = (condition.operator ?? 'EQ').toUpperCase() as WorkflowConditionOperator;

    if (op === 'EQ') {
      return left === right;
    }
    if (op === 'NEQ') {
      return left !== right;
    }

    if (op === 'IN' || op === 'NOT_IN') {
      if (!Array.isArray(right)) {
        return false;
      }
      const included = right.includes(left as never);
      return op === 'IN' ? included : !included;
    }

    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) {
      return false;
    }

    if (op === 'GT') {
      return leftNumber > rightNumber;
    }
    if (op === 'GTE') {
      return leftNumber >= rightNumber;
    }
    if (op === 'LT') {
      return leftNumber < rightNumber;
    }
    if (op === 'LTE') {
      return leftNumber <= rightNumber;
    }

    return false;
  }

  private getInitialStep(graph: WorkflowDefinitionGraph): WorkflowStep {
    if (graph.initialStep) {
      return this.findStep(graph, graph.initialStep);
    }

    const first = graph.steps[0];
    if (!first) {
      throw new BadRequestException('Workflow graph has no steps.');
    }
    return first;
  }

  private findStep(graph: WorkflowDefinitionGraph, stepKey: string): WorkflowStep {
    const step = graph.steps.find((item) => item.key === stepKey);
    if (!step) {
      throw new BadRequestException(`Workflow step not found: ${stepKey}`);
    }
    return step;
  }

  private getCurrentStep(instance: { currentStep: string | null }): string {
    if (!instance.currentStep) {
      throw new BadRequestException('Workflow instance does not have currentStep.');
    }
    return instance.currentStep;
  }

  private resolveTerminalStatus(status: string | GenericStatus | undefined, action: WorkflowDecisionAction): GenericStatus {
    if (status && Object.values(GenericStatus).includes(status as GenericStatus)) {
      return status as GenericStatus;
    }

    if (action === 'APPROVE') {
      return GenericStatus.APPROVED;
    }
    if (action === 'REJECT') {
      return GenericStatus.REJECTED;
    }
    return GenericStatus.ARCHIVED;
  }

  private assertPendingInstance(instance: { status: GenericStatus }) {
    if (TERMINAL_STATUSES.includes(instance.status)) {
      throw new BadRequestException(`Workflow instance already terminal: ${instance.status}`);
    }
    if (instance.status !== GenericStatus.PENDING) {
      throw new BadRequestException(`Workflow instance must be PENDING. Current=${instance.status}`);
    }
  }

  private async pickPendingApproval(
    instanceId: string,
    stepKey: string,
    approvalId: string | undefined,
    actor: DecisionActor,
    options: { bypassActorCheck?: boolean } = {}
  ) {
    const where: Prisma.ApprovalWhereInput = {
      instanceId,
      stepKey,
      status: GenericStatus.PENDING,
      ...(approvalId ? { id: approvalId } : {}),
      ...(approvalId ? {} : actor.actorId ? { approverId: actor.actorId } : {})
    };

    const selected = await this.prisma.client.approval.findFirst({
      where,
      orderBy: { createdAt: 'asc' }
    });

    if (!selected) {
      throw new BadRequestException('No pending approval found for this action.');
    }

    if (options.bypassActorCheck) {
      return selected;
    }

    if (!actor.actorId) {
      throw new ForbiddenException('Không xác định được người duyệt.');
    }

    const authorized = await this.isActorAuthorizedForApproval(selected, actor);
    if (!authorized) {
      throw new ForbiddenException('Bạn không được phân công phê duyệt task này.');
    }

    return selected;
  }

  private async createActionLog(
    instanceId: string,
    action: WorkflowActionType,
    params: {
      fromStep: string | null;
      toStep: string | null;
      actorId: string | null;
      note: string | null;
      metadata?: Record<string, unknown>;
    }
  ) {
    await this.prisma.client.workflowActionLog.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        instanceId,
        action,
        fromStep: params.fromStep,
        toStep: params.toStep,
        actorId: params.actorId,
        note: params.note,
        metadataJson: this.toInputJson(params.metadata)
      }
    });
  }

  private computeDueAt(slaHours?: number): Date | null {
    if (slaHours === undefined || slaHours === null) {
      return null;
    }

    const normalized = Number(slaHours);
    if (!Number.isFinite(normalized) || normalized <= 0) {
      return null;
    }

    return new Date(Date.now() + normalized * 60 * 60 * 1000);
  }

  private mergeNote(original: string | null | undefined, incoming: string | null | undefined) {
    const next = incoming?.trim();
    if (!next) {
      return original ?? null;
    }
    if (!original || !original.trim()) {
      return next;
    }
    return `${original}\n${next}`;
  }

  async runAutoEscalation(limit = 200) {
    const approvalPolicy = await this.runtimeSettings.getApprovalMatrixRuntime();
    if (!approvalPolicy.escalation.enabled) {
      return { scanned: 0, escalated: 0, skipped: 0 };
    }

    const now = new Date();
    const overdueTasks = await this.prisma.client.approval.findMany({
      where: {
        status: GenericStatus.PENDING,
        dueAt: { lte: now },
        escalatedAt: null,
        instance: {
          status: GenericStatus.PENDING
        }
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
      take: Math.max(1, Math.min(limit, 1000))
    });

    let escalated = 0;
    let skipped = 0;
    for (const task of overdueTasks) {
      const done = await this.autoEscalateTask(task.id);
      if (done) {
        escalated += 1;
      } else {
        skipped += 1;
      }
    }

    return {
      scanned: overdueTasks.length,
      escalated,
      skipped
    };
  }

  async autoEscalateTask(taskId: string) {
    const task = await this.ensureApproval(taskId);
    if (task.status !== GenericStatus.PENDING || task.escalatedAt) {
      return false;
    }
    if (!task.instanceId) {
      return false;
    }

    const instance = await this.ensureInstance(task.instanceId);
    if (instance.status !== GenericStatus.PENDING) {
      return false;
    }

    const approvalPolicy = await this.runtimeSettings.getApprovalMatrixRuntime();
    const targetRole = String(task.escalatedTo ?? approvalPolicy.escalation.escalateToRole ?? '').trim();
    if (!targetRole) {
      this.logger.warn(`Skip auto escalation for task ${task.id}: missing escalate target.`);
      return false;
    }

    const systemActor: DecisionActor = {
      actorId: 'system-sla',
      role: UserRole.ADMIN,
      email: null,
      employeeId: null,
      source: 'legacy'
    };
    const target = await this.resolveSingleApprover(
      targetRole.startsWith('ROLE:') ? targetRole : `ROLE:${targetRole}`,
      systemActor,
      {
        preferRole: targetRole.replace(/^ROLE:/i, '')
      }
    );

    const updated = await this.prisma.client.approval.updateMany({
      where: {
        id: task.id,
        status: GenericStatus.PENDING,
        escalatedAt: null
      },
      data: {
        approverId: target.approverId,
        assignmentType: target.assignmentType,
        assignmentSource: target.assignmentSource,
        escalatedTo: targetRole,
        escalatedAt: new Date(),
        escalationCount: {
          increment: 1
        },
        decisionNote: this.mergeNote(task.decisionNote, 'Auto escalated by SLA scheduler'),
        decisionActorId: systemActor.actorId
      }
    });
    if (updated.count === 0) {
      return false;
    }

    await this.createActionLog(instance.id, WORKFLOW_ACTIONS.AUTO_ESCALATE, {
      actorId: systemActor.actorId,
      fromStep: task.stepKey ?? instance.currentStep,
      toStep: task.stepKey ?? instance.currentStep,
      note: `Auto escalated to ${target.approverId}`,
      metadata: {
        taskId: task.id,
        requestedTarget: targetRole
      }
    });
    return true;
  }

  private async resolveDecisionActor(legacyActorId?: string | null): Promise<DecisionActor> {
    const authUserRaw = this.cls.get(AUTH_USER_CONTEXT_KEY) as AuthUser | undefined;
    const actorId = this.cleanString(authUserRaw?.userId ?? authUserRaw?.sub);
    if (actorId) {
      return {
        actorId,
        role: authUserRaw?.role ?? null,
        email: this.cleanString(authUserRaw?.email),
        employeeId: this.cleanString(authUserRaw?.employeeId),
        source: 'auth'
      };
    }

    const fallbackActorId = this.cleanString(legacyActorId);
    if (fallbackActorId) {
      return {
        actorId: fallbackActorId,
        role: null,
        email: null,
        employeeId: null,
        source: 'legacy'
      };
    }

    return {
      actorId: null,
      role: null,
      email: null,
      employeeId: null,
      source: 'none'
    };
  }

  private async deriveLegacyApproverTokens(actor: DecisionActor) {
    const result = new Set<string>();
    if (actor.role) {
      result.add(`ROLE:${String(actor.role).toUpperCase()}`);
    }

    const employeeId = actor.employeeId;
    if (!employeeId) {
      return Array.from(result);
    }

    const employee = await this.prisma.client.employee.findFirst({
      where: { id: employeeId },
      select: { departmentId: true, orgUnitId: true }
    });
    const departmentId = this.cleanString(employee?.departmentId);
    const orgUnitId = this.cleanString(employee?.orgUnitId);
    if (departmentId) {
      result.add(`DEPT:${departmentId}`);
    }
    if (orgUnitId) {
      result.add(`DEPT:${orgUnitId}`);
    }

    return Array.from(result);
  }

  private resolveApprovalMode(step: WorkflowStep): WorkflowApprovalMode {
    const raw = String(step.approvalMode ?? '').trim().toUpperCase();
    if (raw === 'ANY' || raw === 'ALL' || raw === 'MIN_N') {
      return raw;
    }
    return 'ALL';
  }

  private normalizeMinApprovers(value: unknown) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) {
      return null;
    }
    return Math.max(1, Math.trunc(normalized));
  }

  private resolveApprovalGate(step: WorkflowStep, assignedCount: number) {
    const mode = this.resolveApprovalMode(step);
    const boundedAssigned = Math.max(0, assignedCount);

    if (mode === 'ANY') {
      return {
        mode,
        requiredApprovals: boundedAssigned > 0 ? 1 : 0
      };
    }

    if (mode === 'MIN_N') {
      const minApprovers = this.normalizeMinApprovers(step.minApprovers) ?? 1;
      return {
        mode,
        requiredApprovals: Math.min(Math.max(1, minApprovers), Math.max(1, boundedAssigned))
      };
    }

    return {
      mode: 'ALL' as const,
      requiredApprovals: Math.max(1, boundedAssigned)
    };
  }

  private assertSeparationOfDuties(
    approval: { requesterId: string | null; approverId?: string | null },
    actor: DecisionActor
  ) {
    if (!actor.actorId) {
      throw new ForbiddenException('Không xác định được người thao tác.');
    }
    if (approval.requesterId && approval.requesterId === actor.actorId) {
      throw new ForbiddenException('SoD: người gửi yêu cầu không được tự phê duyệt.');
    }
  }

  private async isActorAuthorizedForApproval(
    approval: { approverId: string | null },
    actor: DecisionActor
  ) {
    if (!actor.actorId) {
      return false;
    }

    const assigned = this.cleanString(approval.approverId);
    if (!assigned) {
      return false;
    }

    if (assigned === actor.actorId) {
      return true;
    }

    if (actor.email && assigned.toLowerCase() === actor.email.toLowerCase()) {
      return true;
    }

    if (assigned.toUpperCase().startsWith('ROLE:') && actor.role) {
      return assigned.toUpperCase() === `ROLE:${String(actor.role).toUpperCase()}`;
    }

    if (assigned.toUpperCase().startsWith('DEPT:')) {
      const departmentId = assigned.slice('DEPT:'.length).trim();
      if (!departmentId || !actor.employeeId) {
        return false;
      }
      const employee = await this.prisma.client.employee.findFirst({
        where: { id: actor.employeeId },
        select: { departmentId: true, orgUnitId: true }
      });
      return departmentId === this.cleanString(employee?.departmentId) || departmentId === this.cleanString(employee?.orgUnitId);
    }

    return false;
  }

  private async resolveSingleApprover(
    rawTarget: string,
    actor: DecisionActor,
    options: { preferRole?: string; allowUnresolvedUserId?: boolean } = {}
  ) {
    const normalized = this.cleanString(rawTarget);
    if (!normalized) {
      throw new BadRequestException('Thiếu người nhận xử lý.');
    }

    const candidates = await this.normalizeApproverAssignments([normalized], {
      allowUnresolvedUserId: options.allowUnresolvedUserId
    });

    if (candidates.length === 0) {
      throw new BadRequestException(`Không resolve được người duyệt từ '${rawTarget}'.`);
    }

    const preferredRole = this.cleanString(options.preferRole)?.toUpperCase() ?? null;
    const picked = candidates.find((candidate) => {
      if (!preferredRole) {
        return candidate.approverId !== actor.actorId;
      }
      return candidate.assignmentSource.toUpperCase() === `ROLE:${preferredRole}` && candidate.approverId !== actor.actorId;
    }) ?? candidates.find((candidate) => candidate.approverId !== actor.actorId) ?? candidates[0];

    return picked;
  }

  private async normalizeApproverAssignments(
    approvers: string[],
    options: { allowUnresolvedUserId?: boolean } = {}
  ) {
    const resolved: Array<{ approverId: string; assignmentType: 'USER' | 'ROLE' | 'DEPARTMENT'; assignmentSource: string }> = [];

    for (const raw of approvers) {
      const normalized = this.cleanString(raw);
      if (!normalized) {
        continue;
      }

      const upper = normalized.toUpperCase();
      if (upper.startsWith('ROLE:')) {
        const roleToken = upper.slice('ROLE:'.length).trim();
        if (!roleToken) {
          continue;
        }
        if (!(Object.values(UserRole) as string[]).includes(roleToken)) {
          continue;
        }
        const users = await this.prisma.client.user.findMany({
          where: {
            role: roleToken as UserRole,
            isActive: true
          },
          select: { id: true }
        });
        for (const user of users) {
          resolved.push({
            approverId: user.id,
            assignmentType: 'ROLE',
            assignmentSource: `ROLE:${roleToken}`
          });
        }
        continue;
      }

      if (upper.startsWith('DEPT:')) {
        const deptToken = normalized.slice('DEPT:'.length).trim();
        if (!deptToken) {
          continue;
        }
        const employees = await this.prisma.client.employee.findMany({
          where: {
            OR: [
              { departmentId: deptToken },
              { orgUnitId: deptToken }
            ]
          },
          select: { id: true }
        });
        if (employees.length === 0) {
          continue;
        }
        const users = await this.prisma.client.user.findMany({
          where: {
            employeeId: { in: employees.map((item) => item.id) },
            isActive: true
          },
          select: { id: true }
        });
        for (const user of users) {
          resolved.push({
            approverId: user.id,
            assignmentType: 'DEPARTMENT',
            assignmentSource: `DEPT:${deptToken}`
          });
        }
        continue;
      }

      const candidate = await this.resolveUserCandidate(normalized, options.allowUnresolvedUserId === true);
      if (!candidate) {
        continue;
      }
      resolved.push({
        approverId: candidate,
        assignmentType: 'USER',
        assignmentSource: normalized
      });
    }

    const deduped = new Map<string, { approverId: string; assignmentType: 'USER' | 'ROLE' | 'DEPARTMENT'; assignmentSource: string }>();
    for (const item of resolved) {
      if (!deduped.has(item.approverId)) {
        deduped.set(item.approverId, item);
      }
    }
    return Array.from(deduped.values());
  }

  private async resolveUserCandidate(raw: string, allowUnresolvedUserId = false) {
    const byId = await this.prisma.client.user.findFirst({
      where: {
        id: raw,
        isActive: true
      },
      select: { id: true }
    });
    if (byId?.id) {
      return byId.id;
    }

    const byEmail = raw.includes('@')
      ? await this.prisma.client.user.findFirst({
          where: {
            email: raw,
            isActive: true
          },
          select: { id: true }
        })
      : null;
    if (byEmail?.id) {
      return byEmail.id;
    }

    const byEmployee = await this.prisma.client.user.findFirst({
      where: {
        employeeId: raw,
        isActive: true
      },
      select: { id: true }
    });
    if (byEmployee?.id) {
      return byEmployee.id;
    }

    return allowUnresolvedUserId ? raw : null;
  }

  private async syncTargetAfterWorkflowDecision(
    instance: { id: string; targetType: string; targetId: string; contextJson: Prisma.JsonValue | null },
    terminalStatus: GenericStatus
  ) {
    if (instance.targetType !== 'ORDER_EDIT') {
      return;
    }

    const context = (instance.contextJson as Record<string, unknown> | null) ?? {};
    const tenantId = this.prisma.getTenantId();
    const order = await this.prisma.client.order.findFirst({
      where: { id: instance.targetId },
      include: {
        items: true,
        invoices: {
          select: {
            id: true,
            invoiceNo: true,
            status: true,
            createdAt: true
          }
        }
      }
    });
    if (!order) {
      return;
    }

    const nextStatus = terminalStatus === GenericStatus.APPROVED ? GenericStatus.APPROVED : GenericStatus.REJECTED;
    await this.prisma.client.$transaction(async (tx) => {
      if (nextStatus === GenericStatus.APPROVED) {
        const items = Array.isArray(context.items) ? context.items as Array<Record<string, unknown>> : [];
        if (items.length > 0) {
          await tx.orderItem.deleteMany({
            where: {
              orderId: order.id
            }
          });
          await tx.orderItem.createMany({
            data: items.map((item) => ({
              tenant_Id: tenantId,
              orderId: order.id,
              productId: this.cleanString(item.productId) ?? null,
              productName: this.cleanString(item.productName) ?? null,
              quantity: Math.max(1, Number(item.quantity ?? 1)),
              unitPrice: Number(item.unitPrice ?? 0)
            }))
          });
        }
      }

      await tx.order.updateMany({
        where: { id: order.id },
        data: {
          status: nextStatus,
          totalAmount:
            nextStatus === GenericStatus.APPROVED && context.totalAmount !== undefined
              ? Number(context.totalAmount)
              : undefined,
          employeeId:
            nextStatus === GenericStatus.APPROVED && Object.prototype.hasOwnProperty.call(context, 'employeeId')
              ? (this.cleanString(context.employeeId) ?? null)
              : undefined
        }
      });

      if (order.createdBy) {
        await tx.notification.create({
          data: {
            tenant_Id: tenantId,
            userId: order.createdBy,
            title: nextStatus === GenericStatus.APPROVED ? 'Yêu cầu chỉnh sửa đã được duyệt' : 'Yêu cầu chỉnh sửa bị từ chối',
            content:
              nextStatus === GenericStatus.APPROVED
                ? `Đơn hàng ${order.orderNo ?? order.id} đã được phê duyệt thay đổi.`
                : `Đơn hàng ${order.orderNo ?? order.id} đã bị từ chối thay đổi.`
          }
        });
      }
    });

    const updatedOrder = await this.prisma.client.order.findFirst({
      where: { id: order.id },
      include: {
        items: true,
        invoices: {
          select: {
            id: true,
            invoiceNo: true,
            status: true,
            createdAt: true
          }
        }
      }
    });
    if (updatedOrder) {
      await this.search.syncOrderUpsert(updatedOrder);
    }
  }

  private cleanString(value: unknown) {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  private toInputJson(value: unknown): Prisma.InputJsonValue | Prisma.NullTypes.DbNull {
    if (value === undefined || value === null) {
      return Prisma.DbNull;
    }
    return value as Prisma.InputJsonValue;
  }

  private getFieldValue(input: Record<string, unknown> | null, path: string): unknown {
    if (!input || !path.trim()) {
      return undefined;
    }

    const segments = path.split('.').map((item) => item.trim()).filter(Boolean);
    if (segments.length === 0) {
      return undefined;
    }

    let current: unknown = input;
    for (const segment of segments) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }

    return current;
  }

  private parseDate(value: string, fieldName: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid date for ${fieldName}`);
    }
    return parsed;
  }

  private take(limit?: number) {
    if (!limit || limit <= 0) {
      return 50;
    }
    return Math.min(limit, 100);
  }

  private async ensureDefinition(id: string) {
    const definition = await this.prisma.client.workflowDefinition.findFirst({
      where: { id }
    });

    if (!definition) {
      throw new NotFoundException(`Workflow definition not found: ${id}`);
    }

    return definition;
  }

  private async ensureInstance(id: string) {
    const instance = await this.prisma.client.workflowInstance.findFirst({
      where: { id }
    });

    if (!instance) {
      throw new NotFoundException(`Workflow instance not found: ${id}`);
    }

    return instance;
  }

  private async ensureApproval(id: string) {
    const approval = await this.prisma.client.approval.findFirst({ where: { id } });
    if (!approval) {
      throw new NotFoundException(`Approval not found: ${id}`);
    }
    return approval;
  }
}
