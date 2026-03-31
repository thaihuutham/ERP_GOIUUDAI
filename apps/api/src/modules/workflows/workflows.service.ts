import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { GenericStatus, Prisma, UserRole } from '@prisma/client';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
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
  WorkflowDecisionDto,
  WorkflowsListQueryDto
} from './dto/workflows.dto';

type WorkflowActionType = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'CANCEL' | 'REASSIGN' | 'DELEGATE' | 'ESCALATE';
type WorkflowDecisionAction = 'APPROVE' | 'REJECT' | 'CANCEL';
type WorkflowConditionOperator = 'EQ' | 'NEQ' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'IN' | 'NOT_IN';

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
  ESCALATE: 'ESCALATE' as WorkflowActionType
};

const TERMINAL_STATUSES: GenericStatus[] = [
  GenericStatus.APPROVED,
  GenericStatus.REJECTED,
  GenericStatus.ARCHIVED,
  GenericStatus.INACTIVE
];

@Injectable()
export class WorkflowsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RuntimeSettingsService) private readonly runtimeSettings: RuntimeSettingsService
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
        status: body.status ?? GenericStatus.ACTIVE
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
    const graph = this.parseDefinitionGraph(definition.definitionJson);
    const initialStep = this.getInitialStep(graph);

    const context = {
      ...(body.contextJson ?? {}),
      requestedBy: body.requestedBy ?? null
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
        startedBy: body.requestedBy ?? null,
        contextJson: this.toInputJson(context),
        submittedAt
      }
    });

    await this.createActionLog(instance.id, WORKFLOW_ACTIONS.SUBMIT, {
      actorId: body.requestedBy ?? null,
      fromStep: null,
      toStep: initialStep.key,
      note: 'Workflow submitted',
      metadata: {
        definitionId: definition.id,
        module: definition.module
      }
    });

    await this.ensureStepApprovals(instance, graph, initialStep, body.requestedBy ?? null, 0);
    return this.getInstanceDetail(instance.id);
  }

  async approveInstance(instanceId: string, body: WorkflowDecisionDto) {
    const instance = await this.ensureInstance(instanceId);
    this.assertPendingInstance(instance);

    const currentStepKey = this.getCurrentStep(instance);
    const approval = await this.pickPendingApproval(instance.id, currentStepKey, body.approvalId, body.actorId);

    await this.prisma.client.approval.updateMany({
      where: { id: approval.id },
      data: {
        status: GenericStatus.APPROVED,
        decidedAt: new Date(),
        decisionNote: body.note
      }
    });

    const pendingApprovals = await this.prisma.client.approval.findMany({
      where: {
        instanceId: instance.id,
        stepKey: currentStepKey,
        status: GenericStatus.PENDING
      }
    });

    if (pendingApprovals.length > 0) {
      await this.createActionLog(instance.id, WORKFLOW_ACTIONS.APPROVE, {
        actorId: body.actorId ?? null,
        fromStep: currentStepKey,
        toStep: currentStepKey,
        note: body.note ?? 'Step partially approved',
        metadata: {
          approvalId: approval.id,
          remainingApprovals: pendingApprovals.length
        }
      });
      return this.getInstanceDetail(instance.id);
    }

    await this.advanceByDecision(instance.id, 'APPROVE', body.actorId ?? null, body.note ?? null);
    return this.getInstanceDetail(instance.id);
  }

  async rejectInstance(instanceId: string, body: WorkflowDecisionDto) {
    const instance = await this.ensureInstance(instanceId);
    this.assertPendingInstance(instance);

    const currentStepKey = this.getCurrentStep(instance);
    const approval = await this.pickPendingApproval(instance.id, currentStepKey, body.approvalId, body.actorId);

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
        decisionNote: body.note ?? 'Rejected by workflow decision'
      }
    });

    await this.prisma.client.approval.updateMany({
      where: { id: approval.id },
      data: {
        status: GenericStatus.REJECTED,
        decidedAt: now,
        decisionNote: body.note
      }
    });

    await this.advanceByDecision(instance.id, 'REJECT', body.actorId ?? null, body.note ?? null);
    return this.getInstanceDetail(instance.id);
  }

  async cancelInstance(instanceId: string, body: WorkflowDecisionDto) {
    const instance = await this.ensureInstance(instanceId);
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
        decisionNote: body.note ?? 'Cancelled'
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
      actorId: body.actorId ?? null,
      fromStep: instance.currentStep,
      toStep: null,
      note: body.note ?? 'Workflow cancelled'
    });

    return this.getInstanceDetail(instance.id);
  }

  async reassignInstance(instanceId: string, body: ReassignWorkflowDto) {
    const instance = await this.ensureInstance(instanceId);
    this.assertPendingInstance(instance);

    const currentStepKey = this.getCurrentStep(instance);
    const approval = await this.pickPendingApproval(instance.id, currentStepKey, body.approvalId, body.actorId);

    await this.prisma.client.approval.updateMany({
      where: { id: approval.id },
      data: {
        approverId: body.toApproverId,
        decisionNote: this.mergeNote(approval.decisionNote, body.note)
      }
    });

    await this.createActionLog(instance.id, WORKFLOW_ACTIONS.REASSIGN, {
      actorId: body.actorId ?? null,
      fromStep: currentStepKey,
      toStep: currentStepKey,
      note: body.note ?? `Reassigned to ${body.toApproverId}`,
      metadata: {
        approvalId: approval.id,
        fromApproverId: approval.approverId,
        toApproverId: body.toApproverId
      }
    });

    return this.getInstanceDetail(instance.id);
  }

  async delegateInstance(instanceId: string, body: DelegateWorkflowDto) {
    const instance = await this.ensureInstance(instanceId);
    this.assertPendingInstance(instance);
    const approvalPolicy = await this.runtimeSettings.getApprovalMatrixRuntime();

    if (approvalPolicy.delegation.enabled === false) {
      throw new BadRequestException('Tính năng delegation đang tắt theo approval_matrix.delegation.enabled.');
    }

    const currentStepKey = this.getCurrentStep(instance);
    const approval = await this.pickPendingApproval(instance.id, currentStepKey, body.approvalId, body.actorId);

    if (approval.delegatedAt) {
      const maxMs = Number(approvalPolicy.delegation.maxDays || 14) * 24 * 60 * 60 * 1000;
      if (Date.now() - approval.delegatedAt.getTime() > maxMs) {
        throw new BadRequestException('Không thể delegate: đã vượt quá approval_matrix.delegation.maxDays.');
      }
    }

    await this.prisma.client.approval.updateMany({
      where: { id: approval.id },
      data: {
        approverId: body.toApproverId,
        delegatedTo: body.toApproverId,
        delegatedAt: new Date(),
        decisionNote: this.mergeNote(approval.decisionNote, body.note)
      }
    });

    await this.createActionLog(instance.id, WORKFLOW_ACTIONS.DELEGATE, {
      actorId: body.actorId ?? null,
      fromStep: currentStepKey,
      toStep: currentStepKey,
      note: body.note ?? `Delegated to ${body.toApproverId}`,
      metadata: {
        approvalId: approval.id,
        fromApproverId: approval.approverId,
        toApproverId: body.toApproverId
      }
    });

    return this.getInstanceDetail(instance.id);
  }

  async escalateInstance(instanceId: string, body: EscalateWorkflowDto) {
    const instance = await this.ensureInstance(instanceId);
    this.assertPendingInstance(instance);
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
    const approval = await this.pickPendingApproval(instance.id, currentStepKey, body.approvalId, body.actorId);

    await this.prisma.client.approval.updateMany({
      where: { id: approval.id },
      data: {
        approverId: body.escalatedTo,
        escalatedTo: body.escalatedTo,
        escalatedAt: new Date(),
        decisionNote: this.mergeNote(approval.decisionNote, body.note)
      }
    });

    await this.createActionLog(instance.id, WORKFLOW_ACTIONS.ESCALATE, {
      actorId: body.actorId ?? null,
      fromStep: currentStepKey,
      toStep: currentStepKey,
      note: body.note ?? `Escalated to ${body.escalatedTo}`,
      metadata: {
        approvalId: approval.id,
        fromApproverId: approval.approverId,
        toApproverId: body.escalatedTo
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

  async listApprovals(query: WorkflowsListQueryDto) {
    return this.prisma.client.approval.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.targetType ? { targetType: query.targetType } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });
  }

  async createApproval(body: CreateApprovalDto) {
    if (body.instanceId) {
      await this.ensureInstance(body.instanceId);
    }

    return this.prisma.client.approval.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        instanceId: body.instanceId ?? null,
        targetType: body.targetType,
        targetId: body.targetId,
        requesterId: body.requesterId,
        approverId: body.approverId ?? null,
        stepKey: body.stepKey ?? null,
        contextJson: this.toInputJson(body.contextJson),
        dueAt: body.dueAt ? this.parseDate(body.dueAt, 'dueAt') : null,
        status: body.status ?? GenericStatus.PENDING
      }
    });
  }

  async updateApproval(id: string, body: UpdateApprovalDto) {
    await this.ensureApproval(id);

    await this.prisma.client.approval.updateMany({
      where: { id },
      data: {
        approverId: body.approverId,
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
      await this.ensureStepApprovals(updatedInstance, graph, nextStep, actorId, 0);
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

    if (approvers.length === 0) {
      if (step.autoApprove) {
        await this.advanceByDecision(instance.id, 'APPROVE', requesterId, `Auto-approved step ${step.key}`);
        return;
      }
      throw new BadRequestException(`No approvers resolved for workflow step: ${step.key}`);
    }

    const effectiveSlaHours = step.slaHours ?? (approvalPolicy.escalation.enabled ? approvalPolicy.escalation.slaHours : undefined);
    const dueAt = this.computeDueAt(effectiveSlaHours);
    await this.prisma.client.approval.createMany({
      data: approvers.map((approverId) => ({
        tenant_Id: this.prisma.getTenantId(),
        instanceId: instance.id,
        targetType: instance.targetType,
        targetId: instance.targetId,
        requesterId: requesterId ?? 'SYSTEM',
        approverId,
        stepKey: step.key,
        dueAt,
        escalatedTo: approvalPolicy.escalation.enabled ? approvalPolicy.escalation.escalateToRole : null,
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

  private async pickPendingApproval(instanceId: string, stepKey: string, approvalId?: string, actorId?: string) {
    const where: Prisma.ApprovalWhereInput = {
      instanceId,
      stepKey,
      status: GenericStatus.PENDING,
      ...(approvalId ? { id: approvalId } : {}),
      ...(approvalId ? {} : actorId ? { approverId: actorId } : {})
    };

    const selected = await this.prisma.client.approval.findFirst({
      where,
      orderBy: { createdAt: 'asc' }
    });

    if (selected) {
      return selected;
    }

    if (!approvalId && actorId) {
      const fallback = await this.prisma.client.approval.findFirst({
        where: {
          instanceId,
          stepKey,
          status: GenericStatus.PENDING
        },
        orderBy: { createdAt: 'asc' }
      });
      if (fallback) {
        return fallback;
      }
    }

    throw new BadRequestException('No pending approval found for this action.');
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
