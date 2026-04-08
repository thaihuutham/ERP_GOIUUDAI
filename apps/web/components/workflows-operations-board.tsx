'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, FileText, GitBranch, RefreshCw, SendHorizonal, ShieldAlert } from 'lucide-react';
import {
  apiRequest,
  normalizeListPayload,
  normalizePagedListPayload,
  type ApiListSortMeta
} from '../lib/api-client';
import { formatRuntimeDateTime } from '../lib/runtime-format';
import { formatBulkSummary, runBulkOperation, type BulkExecutionResult, type BulkRowId } from '../lib/bulk-actions';
import { useCursorTableState } from '../lib/use-cursor-table-state';
import { useAccessPolicy } from './access-policy-context';
import { SidePanel } from './ui/side-panel';
import { StandardDataTable, type ColumnDefinition, type StandardTableBulkAction } from './ui/standard-data-table';

type WorkflowStatus = 'DRAFT' | 'PENDING' | 'ACTIVE' | 'APPROVED' | 'REJECTED' | 'ARCHIVED' | 'INACTIVE';
type WorkflowTaskAction = 'approve' | 'reject' | 'delegate' | 'reassign';

type IamUser = {
  id: string;
  email: string;
  role: string;
  employee?: {
    fullName?: string | null;
  } | null;
};

type WorkflowDefinition = {
  id: string;
  code?: string | null;
  name: string;
  module: string;
  version: number;
  status: WorkflowStatus;
  description?: string | null;
  definitionJson?: Record<string, unknown> | null;
};

type WorkflowTask = {
  id: string;
  instanceId?: string | null;
  targetType: string;
  targetId: string;
  requesterId: string;
  approverId?: string | null;
  assignmentType?: string;
  assignmentSource?: string | null;
  stepKey?: string | null;
  approvalMode?: string;
  requiredApprovals?: number | null;
  dueAt?: string | null;
  status: WorkflowStatus;
  createdAt: string;
  instance?: {
    id: string;
    currentStep?: string | null;
    status: WorkflowStatus;
    definition?: {
      id: string;
      name: string;
      module: string;
      code?: string | null;
    } | null;
  } | null;
};

type WorkflowInstance = {
  id: string;
  definitionId: string;
  targetType: string;
  targetId: string;
  currentStep?: string | null;
  status: WorkflowStatus;
  startedBy?: string | null;
  submittedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  definition?: {
    id: string;
    name: string;
    module: string;
    code?: string | null;
  } | null;
  approvals?: WorkflowTask[];
  actionLogs?: Array<{
    id: string;
    action: string;
    fromStep?: string | null;
    toStep?: string | null;
    actorId?: string | null;
    note?: string | null;
    createdAt: string;
  }>;
};

type BuilderStep = {
  id: string;
  templateId: string;
  key: string;
  name: string;
  approvalMode: 'ALL' | 'ANY' | 'MIN_N';
  minApprovers: number;
  slaHours: number;
  approvers: string;
  approveToStep: string;
  rejectToStep: string;
  approveTerminalStatus: WorkflowStatus;
  rejectTerminalStatus: WorkflowStatus;
};

type BuilderDraft = {
  id?: string | null;
  code: string;
  name: string;
  module: string;
  version: number;
  description: string;
  status: WorkflowStatus;
  initialStep: string;
  steps: BuilderStep[];
};

type TabKey = 'inbox' | 'requests' | 'builder' | 'monitor';

type PendingInboxBulkActionContext = {
  action: WorkflowTaskAction;
  rows: WorkflowTask[];
  resolve: (result: BulkExecutionResult | void) => void;
};

const MODULE_OPTIONS = ['crm', 'sales', 'catalog', 'hr', 'finance', 'scm', 'assets', 'projects', 'workflows', 'reports', 'notifications'];
const ROLE_APPROVER_OPTIONS = ['MANAGER', 'ADMIN', 'STAFF', 'DIRECTOR', 'BRANCH_MANAGER', 'DEPARTMENT_MANAGER'];
const TERMINAL_STATUS_OPTIONS: WorkflowStatus[] = ['APPROVED', 'REJECTED', 'ARCHIVED', 'INACTIVE'];
const SIMULATE_ACTION_OPTIONS = ['APPROVE', 'REJECT', 'APPROVE,APPROVE', 'APPROVE,REJECT'];
const STEP_TEMPLATE_OPTIONS = [
  { id: 'manager_approval', key: 'approval', name: 'Phê duyệt quản lý' },
  { id: 'finance_approval', key: 'finance_approval', name: 'Phê duyệt tài chính' },
  { id: 'hr_approval', key: 'hr_approval', name: 'Phê duyệt nhân sự' },
  { id: 'director_approval', key: 'director_approval', name: 'Phê duyệt giám đốc' },
  { id: 'final_review', key: 'final_review', name: 'Kiểm tra cuối' }
];
const WORKFLOW_TABLE_PAGE_SIZE = 25;

function createClientId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function parseApproverTokens(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getStepTemplate(templateId: string) {
  return STEP_TEMPLATE_OPTIONS.find((item) => item.id === templateId) ?? STEP_TEMPLATE_OPTIONS[0];
}

function createStepFromTemplate(templateId = 'manager_approval'): BuilderStep {
  const template = getStepTemplate(templateId);
  return {
    id: createClientId('step'),
    templateId: template.id,
    key: template.key,
    name: template.name,
    approvalMode: 'ALL',
    minApprovers: 1,
    slaHours: 24,
    approvers: 'ROLE:MANAGER',
    approveToStep: '',
    rejectToStep: '',
    approveTerminalStatus: 'APPROVED',
    rejectTerminalStatus: 'REJECTED'
  };
}

function createEmptyDraft(): BuilderDraft {
  const firstStep = createStepFromTemplate('manager_approval');
  return {
    id: null,
    code: `WF_SALES_${Date.now()}`,
    name: '',
    module: 'sales',
    version: 1,
    description: '',
    status: 'DRAFT',
    initialStep: firstStep.key,
    steps: [firstStep]
  };
}

function getUniqueStepKey(baseKey: string, steps: BuilderStep[], currentStepId?: string) {
  const normalizedBase = baseKey.trim() || 'approval';
  let candidate = normalizedBase;
  let counter = 2;
  while (steps.some((step) => step.id !== currentStepId && step.key === candidate)) {
    candidate = `${normalizedBase}_${counter}`;
    counter += 1;
  }
  return candidate;
}

function formatDate(value?: string | null) {
  if (!value) {
    return '--';
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : formatRuntimeDateTime(parsed.toISOString());
}

function workflowActionLabel(action: WorkflowTaskAction) {
  switch (action) {
    case 'approve':
      return 'Phê duyệt';
    case 'reject':
      return 'Từ chối';
    case 'delegate':
      return 'Uỷ quyền';
    case 'reassign':
      return 'Chuyển người xử lý';
    default:
      return action;
  }
}

function normalizeList<T>(payload: unknown): T[] {
  return normalizeListPayload(payload) as T[];
}

function toStatusBadgeClass(status: string) {
  const upper = status.toUpperCase();
  if (upper === 'APPROVED' || upper === 'ACTIVE') return 'status-success';
  if (upper === 'REJECTED' || upper === 'ARCHIVED' || upper === 'INACTIVE') return 'status-danger';
  if (upper === 'PENDING') return 'status-warning';
  return 'status-neutral';
}

function parseApproverRows(value: string) {
  return value
    .split('\n')
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      if (row.toUpperCase().startsWith('ROLE:')) {
        return { type: 'ROLE', role: row.slice('ROLE:'.length).trim().toUpperCase() };
      }
      if (row.toUpperCase().startsWith('DEPT:')) {
        return { type: 'DEPARTMENT', departmentId: row.slice('DEPT:'.length).trim() };
      }
      if (row.toUpperCase().startsWith('VALUE:')) {
        const payload = row.slice('VALUE:'.length);
        const [field, minValue, approverId] = payload.split('|').map((item) => item.trim());
        return {
          type: 'VALUE_RULE',
          field: field || 'amount',
          minValue: Number(minValue || 0),
          approverId
        };
      }
      return { type: 'USER', approverId: row };
    });
}

function buildDefinitionJson(draft: BuilderDraft) {
  const steps = draft.steps
    .map((step) => {
      const transitions: Array<Record<string, unknown>> = [];
      transitions.push({
        action: 'APPROVE',
        ...(step.approveToStep ? { toStep: step.approveToStep } : { terminalStatus: step.approveTerminalStatus })
      });
      transitions.push({
        action: 'REJECT',
        ...(step.rejectToStep ? { toStep: step.rejectToStep } : { terminalStatus: step.rejectTerminalStatus })
      });

      return {
        key: step.key.trim(),
        name: step.name.trim() || step.key.trim(),
        approvalMode: step.approvalMode,
        minApprovers: step.approvalMode === 'MIN_N' ? Number(step.minApprovers || 1) : undefined,
        slaHours: Number(step.slaHours || 24),
        approvers: parseApproverRows(step.approvers),
        transitions
      };
    })
    .filter((step) => step.key);

  return {
    initialStep: draft.initialStep.trim() || steps[0]?.key || 'approval',
    steps
  };
}

export function WorkflowsOperationsBoard() {
  const { canModule } = useAccessPolicy();
  const canView = canModule('workflows');

  const [activeTab, setActiveTab] = useState<TabKey>('inbox');
  const [actorId, setActorId] = useState('manager_1');

  const [iamUsers, setIamUsers] = useState<IamUser[]>([]);
  const [definitions, setDefinitions] = useState<WorkflowDefinition[]>([]);
  const [inboxRows, setInboxRows] = useState<WorkflowTask[]>([]);
  const [requestRows, setRequestRows] = useState<WorkflowInstance[]>([]);
  const [monitorRows, setMonitorRows] = useState<WorkflowInstance[]>([]);

  const [selectedTask, setSelectedTask] = useState<WorkflowTask | null>(null);
  const [taskAction, setTaskAction] = useState<WorkflowTaskAction>('approve');
  const [taskNote, setTaskNote] = useState('');
  const [taskTargetApprover, setTaskTargetApprover] = useState('');
  const [selectedInboxRowIds, setSelectedInboxRowIds] = useState<BulkRowId[]>([]);
  const [selectedRequestRowIds, setSelectedRequestRowIds] = useState<BulkRowId[]>([]);
  const [selectedMonitorRowIds, setSelectedMonitorRowIds] = useState<BulkRowId[]>([]);
  const [pendingInboxBulkAction, setPendingInboxBulkAction] = useState<PendingInboxBulkActionContext | null>(null);
  const [bulkTaskNote, setBulkTaskNote] = useState('');
  const [bulkTaskTargetApprover, setBulkTaskTargetApprover] = useState('');
  const [isRunningInboxBulkAction, setIsRunningInboxBulkAction] = useState(false);
  const [inboxSortBy, setInboxSortBy] = useState('dueAt');
  const [inboxSortDir, setInboxSortDir] = useState<'asc' | 'desc'>('asc');
  const [inboxSortMeta, setInboxSortMeta] = useState<ApiListSortMeta | null>(null);
  const [requestSortBy, setRequestSortBy] = useState('createdAt');
  const [requestSortDir, setRequestSortDir] = useState<'asc' | 'desc'>('desc');
  const [requestSortMeta, setRequestSortMeta] = useState<ApiListSortMeta | null>(null);
  const [monitorSortBy, setMonitorSortBy] = useState('createdAt');
  const [monitorSortDir, setMonitorSortDir] = useState<'asc' | 'desc'>('desc');
  const [monitorSortMeta, setMonitorSortMeta] = useState<ApiListSortMeta | null>(null);

  const [selectedInstance, setSelectedInstance] = useState<WorkflowInstance | null>(null);
  const [builderDraft, setBuilderDraft] = useState<BuilderDraft>(() => createEmptyDraft());
  const [stepApproverSelection, setStepApproverSelection] = useState<Record<string, string>>({});
  const [simulateActions, setSimulateActions] = useState('APPROVE');

  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [simulationResult, setSimulationResult] = useState<unknown>(null);
  const inboxTableFingerprint = useMemo(
    () =>
      JSON.stringify({
        actorId: actorId.trim(),
        sortBy: inboxSortBy,
        sortDir: inboxSortDir,
        limit: WORKFLOW_TABLE_PAGE_SIZE
      }),
    [actorId, inboxSortBy, inboxSortDir]
  );
  const requestTableFingerprint = useMemo(
    () =>
      JSON.stringify({
        actorId: actorId.trim(),
        sortBy: requestSortBy,
        sortDir: requestSortDir,
        limit: WORKFLOW_TABLE_PAGE_SIZE
      }),
    [actorId, requestSortBy, requestSortDir]
  );
  const monitorTableFingerprint = useMemo(
    () =>
      JSON.stringify({
        sortBy: monitorSortBy,
        sortDir: monitorSortDir,
        limit: WORKFLOW_TABLE_PAGE_SIZE
      }),
    [monitorSortBy, monitorSortDir]
  );
  const inboxTablePager = useCursorTableState(inboxTableFingerprint);
  const requestTablePager = useCursorTableState(requestTableFingerprint);
  const monitorTablePager = useCursorTableState(monitorTableFingerprint);

  const loadDefinitions = async () => {
    const payload = await apiRequest('/workflows/definitions', { query: { limit: 100 } });
    setDefinitions(normalizeList<WorkflowDefinition>(payload));
  };

  const loadUsers = async () => {
    const payload = await apiRequest('/settings/iam/users', { query: { limit: 300 } });
    setIamUsers(normalizeList<IamUser>(payload));
  };

  const loadInbox = async () => {
    if (!actorId.trim()) {
      setInboxRows([]);
      return;
    }
    const payload = await apiRequest('/workflows/inbox', {
      query: {
        approverId: actorId.trim(),
        limit: WORKFLOW_TABLE_PAGE_SIZE,
        cursor: inboxTablePager.cursor ?? undefined,
        sortBy: inboxSortBy,
        sortDir: inboxSortDir
      }
    });
    const normalized = normalizePagedListPayload<WorkflowTask>(payload);
    setInboxRows(normalized.items);
    inboxTablePager.syncFromPageInfo(normalized.pageInfo);
    setInboxSortMeta(normalized.sortMeta);
  };

  const loadRequests = async () => {
    if (!actorId.trim()) {
      setRequestRows([]);
      return;
    }
    const payload = await apiRequest('/workflows/requests', {
      query: {
        requesterId: actorId.trim(),
        limit: WORKFLOW_TABLE_PAGE_SIZE,
        cursor: requestTablePager.cursor ?? undefined,
        sortBy: requestSortBy,
        sortDir: requestSortDir
      }
    });
    const normalized = normalizePagedListPayload<WorkflowInstance>(payload);
    setRequestRows(normalized.items);
    requestTablePager.syncFromPageInfo(normalized.pageInfo);
    setRequestSortMeta(normalized.sortMeta);
  };

  const loadMonitor = async () => {
    const payload = await apiRequest('/workflows/instances', {
      query: {
        limit: WORKFLOW_TABLE_PAGE_SIZE,
        cursor: monitorTablePager.cursor ?? undefined,
        sortBy: monitorSortBy,
        sortDir: monitorSortDir
      }
    });
    const normalized = normalizePagedListPayload<WorkflowInstance>(payload);
    setMonitorRows(normalized.items);
    monitorTablePager.syncFromPageInfo(normalized.pageInfo);
    setMonitorSortMeta(normalized.sortMeta);
  };

  const refreshAll = async () => {
    if (!canView) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    try {
      await Promise.all([loadDefinitions(), loadUsers(), loadInbox(), loadRequests(), loadMonitor()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tải dữ liệu quy trình.');
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    if (!canView) {
      return;
    }
    setIsBusy(true);
    setErrorMessage(null);
    void Promise.all([loadDefinitions(), loadUsers()])
      .catch((error) => {
        setErrorMessage(error instanceof Error ? error.message : 'Không thể tải dữ liệu quy trình.');
      })
      .finally(() => {
        setIsBusy(false);
      });
  }, [canView]);

  useEffect(() => {
    if (!canView) {
      return;
    }
    void loadInbox().catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tải hộp duyệt.');
    });
  }, [actorId, canView, inboxSortBy, inboxSortDir, inboxTablePager.currentPage]);

  useEffect(() => {
    if (!canView) {
      return;
    }
    void loadRequests().catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tải danh sách yêu cầu.');
    });
  }, [actorId, canView, requestSortBy, requestSortDir, requestTablePager.currentPage]);

  useEffect(() => {
    if (!canView) {
      return;
    }
    void loadMonitor().catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tải danh sách giám sát.');
    });
  }, [canView, monitorSortBy, monitorSortDir, monitorTablePager.currentPage]);

  useEffect(() => {
    return () => {
      pendingInboxBulkAction?.resolve(undefined);
    };
  }, [pendingInboxBulkAction]);

  const usersById = useMemo(() => new Map(iamUsers.map((user) => [user.id, user])), [iamUsers]);
  const approverPresetOptions = useMemo(
    () => [
      ...ROLE_APPROVER_OPTIONS.map((roleOption) => ({
        value: `ROLE:${roleOption}`,
        label: `Vai trò: ${roleOption}`
      })),
      ...iamUsers.map((user) => ({
        value: user.id,
        label: `Người dùng: ${user.employee?.fullName || user.email} (${user.role})`
      }))
    ],
    [iamUsers]
  );

  const onCreateDefinition = () => {
    const draft = createEmptyDraft();
    setBuilderDraft(draft);
    setStepApproverSelection({});
    setSimulationResult(null);
    setResultMessage('Đã tạo biểu mẫu định nghĩa mới. Vui lòng chọn các giá trị từ danh sách.');
    setErrorMessage(null);
    setActiveTab('builder');
  };

  const onRunTaskAction = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTask) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    setResultMessage(null);

    try {
      if ((taskAction === 'delegate' || taskAction === 'reassign') && !taskTargetApprover.trim()) {
        throw new Error('Vui lòng chọn Người nhận mới trước khi xác nhận.');
      }
      const endpoint = `/workflows/tasks/${selectedTask.id}/${taskAction}`;
      const body: Record<string, unknown> = {
        note: taskNote || undefined,
        actorId: actorId.trim() || undefined
      };
      if (taskAction === 'delegate' || taskAction === 'reassign') {
        body.toApproverId = taskTargetApprover.trim();
      }
      await apiRequest(endpoint, {
        method: 'POST',
        body
      });
      setResultMessage('Thao tác tác vụ thành công.');
      setSelectedTask(null);
      setTaskNote('');
      setTaskTargetApprover('');
      await Promise.all([loadInbox(), loadRequests(), loadMonitor()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể thao tác tác vụ.');
    } finally {
      setIsBusy(false);
    }
  };

  const executeInboxBulkAction = async (
    action: WorkflowTaskAction,
    rows: WorkflowTask[],
    note: string,
    targetApproverId: string
  ): Promise<BulkExecutionResult | undefined> => {
    if (rows.length === 0) {
      return {
        total: 0,
        successCount: 0,
        failedCount: 0,
        failedIds: [],
        failures: [],
        actionLabel: `Hàng loạt ${workflowActionLabel(action)}`,
        message: 'Không có tác vụ nào được chọn.'
      };
    }

    const normalizedTarget = targetApproverId.trim();
    if ((action === 'delegate' || action === 'reassign') && !normalizedTarget) {
      setErrorMessage('Uỷ quyền hoặc chuyển xử lý cần chọn người nhận mới.');
      return undefined;
    }

    if (
      action === 'reject' &&
      !window.confirm(`Xác nhận từ chối ${rows.length} tác vụ đã chọn?`)
    ) {
      return undefined;
    }

    const rowsById = new Map<string, WorkflowTask>();
    rows.forEach((row) => rowsById.set(row.id, row));

    setIsRunningInboxBulkAction(true);
    try {
      const result = await runBulkOperation({
        ids: rows.map((row) => row.id),
        continueOnError: true,
        chunkSize: 10,
        execute: async (taskId) => {
          const task = rowsById.get(String(taskId));
          if (!task) {
            throw new Error(`Không tìm thấy tác vụ ${taskId}.`);
          }
          const endpoint = `/workflows/tasks/${task.id}/${action}`;
          const body: Record<string, unknown> = {
            actorId: actorId.trim() || undefined,
            note: note.trim() || undefined
          };
          if (action === 'delegate' || action === 'reassign') {
            body.toApproverId = normalizedTarget;
          }
          await apiRequest(endpoint, {
            method: 'POST',
            body
          });
        }
      });

      const actionLabel = `Xử lý hàng loạt ${workflowActionLabel(action)} tác vụ`;
      const normalized: BulkExecutionResult = {
        ...result,
        actionLabel,
        message: formatBulkSummary(
          {
            ...result,
            actionLabel
          },
          actionLabel
        )
      };

      if (normalized.successCount > 0) {
        await Promise.all([loadInbox(), loadRequests(), loadMonitor()]);
      }
      setResultMessage(normalized.message ?? null);
      if (normalized.failedCount > 0) {
        setErrorMessage(`Một số tác vụ lỗi khi chạy hàng loạt (${action}).`);
      } else {
        setErrorMessage(null);
      }
      return normalized;
    } catch (error) {
      const ids = rows.map((row) => row.id);
      const fallback: BulkExecutionResult = {
        total: ids.length,
        successCount: 0,
        failedCount: ids.length,
        failedIds: ids,
        failures: ids.map((id) => ({
          id,
          message: error instanceof Error ? error.message : 'Lỗi xử lý hàng loạt hộp duyệt'
        })),
        actionLabel: `Xử lý hàng loạt ${workflowActionLabel(action)} tác vụ`,
        message: `Xử lý hàng loạt ${workflowActionLabel(action)} tác vụ: thất bại ${ids.length}/${ids.length}.`
      };
      setErrorMessage(error instanceof Error ? error.message : 'Không thể xử lý hàng loạt trong hộp duyệt.');
      return fallback;
    } finally {
      setIsRunningInboxBulkAction(false);
    }
  };

  const closePendingInboxBulkAction = () => {
    setPendingInboxBulkAction((current) => {
      current?.resolve(undefined);
      return null;
    });
  };

  const submitPendingInboxBulkAction = async () => {
    if (!pendingInboxBulkAction) {
      return;
    }
    const context = pendingInboxBulkAction;
    const result = await executeInboxBulkAction(
      context.action,
      context.rows,
      bulkTaskNote,
      bulkTaskTargetApprover
    );
    context.resolve(result);
    setPendingInboxBulkAction(null);
    setBulkTaskNote('');
    setBulkTaskTargetApprover('');
  };

  const onSelectDefinition = (definition: WorkflowDefinition) => {
    const graph = definition.definitionJson as { initialStep?: string; steps?: Array<Record<string, unknown>> } | null;
    const mappedSteps = Array.isArray(graph?.steps) && graph.steps.length > 0
      ? graph.steps.map((step) => {
          const rawKey = String(step.key ?? '');
          const upperKey = rawKey.trim().toUpperCase();
          const template = STEP_TEMPLATE_OPTIONS.find((item) => item.key.toUpperCase() === upperKey);
          const transitions = Array.isArray(step.transitions) ? step.transitions : [];
          const approveTransition = transitions.find((item) => String((item as Record<string, unknown>).action ?? '').toUpperCase() === 'APPROVE') as Record<string, unknown> | undefined;
          const rejectTransition = transitions.find((item) => String((item as Record<string, unknown>).action ?? '').toUpperCase() === 'REJECT') as Record<string, unknown> | undefined;

          return {
            id: createClientId('step'),
            templateId: template?.id ?? 'manager_approval',
            key: rawKey,
            name: String(step.name ?? step.key ?? ''),
            approvalMode: (String(step.approvalMode ?? 'ALL').toUpperCase() as BuilderStep['approvalMode']),
            minApprovers: Number(step.minApprovers ?? 1),
            slaHours: Number(step.slaHours ?? 24),
            approvers: Array.isArray(step.approvers)
              ? step.approvers
                  .map((rule) => {
                    const item = rule as Record<string, unknown>;
                    const type = String(item.type ?? '').toUpperCase();
                    if (type === 'ROLE') {
                      return `ROLE:${String(item.role ?? '').toUpperCase()}`;
                    }
                    if (type === 'DEPARTMENT') {
                      return `DEPT:${String(item.departmentId ?? '')}`;
                    }
                    if (type === 'VALUE_RULE') {
                      return `VALUE:${String(item.field ?? 'amount')}|${String(item.minValue ?? 0)}|${String(item.approverId ?? item.userId ?? '')}`;
                    }
                    return String(item.approverId ?? item.userId ?? '');
                  })
                  .filter(Boolean)
                  .join('\n')
              : 'ROLE:MANAGER',
            approveToStep: String(approveTransition?.toStep ?? ''),
            rejectToStep: String(rejectTransition?.toStep ?? ''),
            approveTerminalStatus: (String(approveTransition?.terminalStatus ?? 'APPROVED').toUpperCase() as WorkflowStatus),
            rejectTerminalStatus: (String(rejectTransition?.terminalStatus ?? 'REJECTED').toUpperCase() as WorkflowStatus)
          };
        })
      : [createStepFromTemplate('manager_approval')];

    setBuilderDraft({
      id: definition.id,
      code: String(definition.code ?? ''),
      name: definition.name,
      module: definition.module,
      version: Number(definition.version ?? 1),
      description: String(definition.description ?? ''),
      status: definition.status,
      initialStep: String(graph?.initialStep ?? mappedSteps[0]?.key ?? 'approval'),
      steps: mappedSteps
    });
    setStepApproverSelection({});
    setActiveTab('builder');
  };

  const onSaveDraft = async () => {
    setIsBusy(true);
    setErrorMessage(null);
    setResultMessage(null);
    try {
      const normalizedModule = MODULE_OPTIONS.includes(builderDraft.module) ? builderDraft.module : 'workflows';
      const normalizedCode = builderDraft.code.trim() || `WF_${normalizedModule.toUpperCase()}_${Date.now()}`;
      const normalizedName = builderDraft.name.trim() || `Quy trình ${normalizedModule.toUpperCase()}`;
      const normalizedDraft = {
        ...builderDraft,
        module: normalizedModule,
        code: normalizedCode,
        name: normalizedName
      };
      const body = {
        code: normalizedCode,
        name: normalizedName,
        module: normalizedModule,
        version: Number(builderDraft.version || 1),
        description: builderDraft.description || undefined,
        status: builderDraft.status || 'DRAFT',
        definitionJson: buildDefinitionJson(normalizedDraft)
      };

      if (builderDraft.id) {
        await apiRequest(`/workflows/definitions/${builderDraft.id}`, {
          method: 'PATCH',
          body
        });
      } else {
        const created = await apiRequest<WorkflowDefinition>('/workflows/definitions', {
          method: 'POST',
          body
        });
        setBuilderDraft((prev) => ({ ...prev, id: created.id, module: normalizedModule, code: normalizedCode, name: normalizedName }));
      }

      setResultMessage('Lưu định nghĩa quy trình thành công.');
      await loadDefinitions();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể lưu định nghĩa quy trình.');
    } finally {
      setIsBusy(false);
    }
  };

  const onValidateDefinition = async () => {
    if (!builderDraft.id) {
      setErrorMessage('Cần lưu nháp trước khi kiểm tra.');
      return;
    }
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const result = await apiRequest(`/workflows/definitions/${builderDraft.id}/validate`, { method: 'POST' });
      setSimulationResult(result);
      setResultMessage('Kiểm tra định nghĩa thành công.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Kiểm tra định nghĩa thất bại.');
    } finally {
      setIsBusy(false);
    }
  };

  const onSimulateDefinition = async () => {
    if (!builderDraft.id) {
      setErrorMessage('Cần lưu nháp trước khi mô phỏng.');
      return;
    }
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const actions = simulateActions
        .split(',')
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean);
      const result = await apiRequest(`/workflows/definitions/${builderDraft.id}/simulate`, {
        method: 'POST',
        body: {
          actions,
          contextJson: {
            amount: 100000000
          }
        }
      });
      setSimulationResult(result);
      setResultMessage('Mô phỏng hoàn tất.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Mô phỏng thất bại.');
    } finally {
      setIsBusy(false);
    }
  };

  const onPublishOrArchiveDefinition = async (action: 'publish' | 'archive') => {
    if (!builderDraft.id) {
      setErrorMessage('Cần chọn định nghĩa đã lưu.');
      return;
    }
    setIsBusy(true);
    setErrorMessage(null);
    try {
      await apiRequest(`/workflows/definitions/${builderDraft.id}/${action}`, {
        method: 'POST'
      });
      setResultMessage(action === 'publish' ? 'Kích hoạt quy trình thành công.' : 'Lưu trữ quy trình thành công.');
      await loadDefinitions();
      await loadMonitor();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể cập nhật trạng thái định nghĩa.');
    } finally {
      setIsBusy(false);
    }
  };

  const openMonitorDetail = async (instanceId: string) => {
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const detail = await apiRequest<WorkflowInstance>(`/workflows/instances/${instanceId}`);
      setSelectedInstance(detail);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tải chi tiết phiên chạy.');
    } finally {
      setIsBusy(false);
    }
  };

  const inboxColumns = useMemo<ColumnDefinition<WorkflowTask>[]>(
    () => [
      { key: 'createdAt', label: 'Tạo lúc', sortKey: 'createdAt', render: (row) => formatDate(row.createdAt) },
      { key: 'targetType', label: 'Loại', sortKey: 'targetType', render: (row) => row.targetType },
      {
        key: 'targetId',
        label: 'Đối tượng',
        sortable: false,
        sortDisabledTooltip: 'Sắp xếp theo mã đối tượng chưa hỗ trợ ở đợt này.',
        render: (row) => row.targetId
      },
      {
        key: 'stepKey',
        label: 'Bước',
        sortable: false,
        sortDisabledTooltip: 'Sắp xếp theo step key chưa hỗ trợ ở đợt này.',
        render: (row) => row.stepKey ?? '--'
      },
      { key: 'dueAt', label: 'SLA', sortKey: 'dueAt', render: (row) => formatDate(row.dueAt) },
      {
        key: 'status',
        label: 'Trạng thái',
        sortKey: 'status',
        render: (row) => <span className={toStatusBadgeClass(row.status)}>{row.status}</span>
      }
    ],
    []
  );

  const requestColumns = useMemo<ColumnDefinition<WorkflowInstance>[]>(
    () => [
      { key: 'createdAt', label: 'Tạo lúc', sortKey: 'createdAt', render: (row) => formatDate(row.createdAt) },
      { key: 'targetType', label: 'Loại', sortKey: 'targetType', render: (row) => row.targetType },
      {
        key: 'targetId',
        label: 'Đối tượng',
        sortable: false,
        sortDisabledTooltip: 'Sắp xếp theo mã đối tượng chưa hỗ trợ ở đợt này.',
        render: (row) => row.targetId
      },
      { key: 'currentStep', label: 'Bước hiện tại', sortKey: 'currentStep', render: (row) => row.currentStep ?? '--' },
      {
        key: 'status',
        label: 'Trạng thái',
        sortKey: 'status',
        render: (row) => <span className={toStatusBadgeClass(row.status)}>{row.status}</span>
      }
    ],
    []
  );

  const monitorColumns = useMemo<ColumnDefinition<WorkflowInstance>[]>(
    () => [
      { key: 'createdAt', label: 'Tạo lúc', sortKey: 'createdAt', render: (row) => formatDate(row.createdAt), isLink: true },
      {
        key: 'definitionId',
        label: 'Định nghĩa',
        sortable: false,
        sortDisabledTooltip: 'Sắp xếp theo định nghĩa chưa hỗ trợ ở đợt này.',
        render: (row) => row.definition?.name ?? row.definitionId
      },
      { key: 'targetType', label: 'Loại', sortKey: 'targetType', render: (row) => row.targetType },
      {
        key: 'targetId',
        label: 'Đối tượng',
        sortable: false,
        sortDisabledTooltip: 'Sắp xếp theo mã đối tượng chưa hỗ trợ ở đợt này.',
        render: (row) => row.targetId
      },
      { key: 'currentStep', label: 'Bước', sortKey: 'currentStep', render: (row) => row.currentStep ?? '--' },
      {
        key: 'status',
        label: 'Trạng thái',
        sortKey: 'status',
        render: (row) => <span className={toStatusBadgeClass(row.status)}>{row.status}</span>
      }
    ],
    []
  );

  const inboxBulkActions = useMemo<StandardTableBulkAction<WorkflowTask>[]>(
    () => [
      { key: 'bulk-inbox-approve', label: 'Phê duyệt', tone: 'primary', execute: async (selectedRows) =>
        new Promise<BulkExecutionResult | void>((resolve) => {
          setBulkTaskNote('');
          setBulkTaskTargetApprover('');
          setPendingInboxBulkAction({
            action: 'approve',
            rows: selectedRows.slice(),
            resolve
          });
        })
      },
      { key: 'bulk-inbox-reject', label: 'Từ chối', tone: 'danger', execute: async (selectedRows) =>
        new Promise<BulkExecutionResult | void>((resolve) => {
          setBulkTaskNote('');
          setBulkTaskTargetApprover('');
          setPendingInboxBulkAction({
            action: 'reject',
            rows: selectedRows.slice(),
            resolve
          });
        })
      },
      { key: 'bulk-inbox-delegate', label: 'Uỷ quyền', tone: 'ghost', execute: async (selectedRows) =>
        new Promise<BulkExecutionResult | void>((resolve) => {
          setBulkTaskNote('');
          setBulkTaskTargetApprover(approverPresetOptions[0]?.value ?? '');
          setPendingInboxBulkAction({
            action: 'delegate',
            rows: selectedRows.slice(),
            resolve
          });
        })
      },
      { key: 'bulk-inbox-reassign', label: 'Chuyển người xử lý', tone: 'ghost', execute: async (selectedRows) =>
        new Promise<BulkExecutionResult | void>((resolve) => {
          setBulkTaskNote('');
          setBulkTaskTargetApprover(approverPresetOptions[0]?.value ?? '');
          setPendingInboxBulkAction({
            action: 'reassign',
            rows: selectedRows.slice(),
            resolve
          });
        })
      }
    ],
    [approverPresetOptions]
  );

  if (!canView) {
    return null;
  }

  return (
    <article className="module-workbench">
      <header className="module-header">
        <div>
          <h1>Vận hành quy trình phê duyệt</h1>
          <p>Quản lý hộp duyệt, theo dõi yêu cầu và giám sát phiên chạy quy trình.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            Mã người xử lý
            <input
              value={actorId}
              onChange={(event) => setActorId(event.target.value)}
              placeholder="Mã tài khoản nhận xử lý"
              style={{ marginLeft: '0.45rem', minWidth: '240px' }}
            />
          </label>
          <button className="btn btn-ghost" onClick={() => void refreshAll()} disabled={isBusy}>
            <RefreshCw size={14} />
            Làm mới
          </button>
        </div>
      </header>

      {errorMessage && (
        <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
          {errorMessage}
        </div>
      )}
      {resultMessage && (
        <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
          {resultMessage}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {[
          { key: 'inbox', label: 'Hộp duyệt', icon: <Clock3 size={14} /> },
          { key: 'requests', label: 'Yêu cầu đã gửi', icon: <SendHorizonal size={14} /> },
          { key: 'builder', label: 'Thiết kế quy trình', icon: <GitBranch size={14} /> },
          { key: 'monitor', label: 'Giám sát', icon: <FileText size={14} /> }
        ].map((tab) => (
          <button
            key={tab.key}
            className={`btn ${activeTab === tab.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab(tab.key as TabKey)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'inbox' && (
        <section className="feature-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Hộp phê duyệt cá nhân</h2>
            <span style={{ color: 'var(--muted)', fontSize: '0.8125rem' }}>{inboxRows.length} tác vụ</span>
          </div>
          <StandardDataTable
            data={inboxRows}
            columns={inboxColumns}
            storageKey="erp-workflows-inbox"
            isLoading={isBusy}
            pageInfo={{
              currentPage: inboxTablePager.currentPage,
              hasPrevPage: inboxTablePager.hasPrevPage,
              hasNextPage: inboxTablePager.hasNextPage,
              visitedPages: inboxTablePager.visitedPages
            }}
            sortMeta={
              inboxSortMeta ?? {
                sortBy: inboxSortBy,
                sortDir: inboxSortDir,
                sortableFields: []
              }
            }
            onPageNext={inboxTablePager.goNextPage}
            onPagePrev={inboxTablePager.goPrevPage}
            onJumpVisitedPage={inboxTablePager.jumpVisitedPage}
            onSortChange={(sortBy, sortDir) => {
              setInboxSortBy(sortBy);
              setInboxSortDir(sortDir);
            }}
            onRowClick={(row) => setSelectedTask(row)}
            enableRowSelection
            selectedRowIds={selectedInboxRowIds}
            onSelectedRowIdsChange={setSelectedInboxRowIds}
            bulkActions={inboxBulkActions}
            showDefaultBulkUtilities
          />
          <p style={{ marginTop: '0.85rem', fontSize: '0.8125rem', color: 'var(--muted)' }}>
            <ShieldAlert size={14} style={{ verticalAlign: 'middle', marginRight: '0.35rem' }} />
            SoD nghiêm ngặt: người tạo yêu cầu không được tự duyệt.
          </p>
        </section>
      )}

      {activeTab === 'requests' && (
        <section className="feature-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Yêu cầu tôi đã gửi</h2>
            <span style={{ color: 'var(--muted)', fontSize: '0.8125rem' }}>{requestRows.length} phiên</span>
          </div>
          <StandardDataTable
            data={requestRows}
            columns={requestColumns}
            storageKey="erp-workflows-requests"
            isLoading={isBusy}
            pageInfo={{
              currentPage: requestTablePager.currentPage,
              hasPrevPage: requestTablePager.hasPrevPage,
              hasNextPage: requestTablePager.hasNextPage,
              visitedPages: requestTablePager.visitedPages
            }}
            sortMeta={
              requestSortMeta ?? {
                sortBy: requestSortBy,
                sortDir: requestSortDir,
                sortableFields: []
              }
            }
            onPageNext={requestTablePager.goNextPage}
            onPagePrev={requestTablePager.goPrevPage}
            onJumpVisitedPage={requestTablePager.jumpVisitedPage}
            onSortChange={(sortBy, sortDir) => {
              setRequestSortBy(sortBy);
              setRequestSortDir(sortDir);
            }}
            enableRowSelection
            selectedRowIds={selectedRequestRowIds}
            onSelectedRowIdsChange={setSelectedRequestRowIds}
            showDefaultBulkUtilities
          />
        </section>
      )}

      {activeTab === 'builder' && (
        <section className="feature-panel" style={{ display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 0.8fr) minmax(320px, 1.2fr)', gap: '1rem' }}>
            <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', padding: '0.75rem' }}>
              <h3 style={{ fontSize: '0.95rem', marginBottom: '0.65rem' }}>Danh sách định nghĩa</h3>
              <div style={{ maxHeight: '380px', overflow: 'auto', display: 'grid', gap: '0.4rem' }}>
                <button className="btn btn-ghost" onClick={onCreateDefinition}>
                  + Tạo định nghĩa mới
                </button>
                {definitions.map((definition) => (
                  <button
                    key={definition.id}
                    className="btn btn-ghost"
                    style={{ justifyContent: 'space-between' }}
                    onClick={() => onSelectDefinition(definition)}
                  >
                    <span>{definition.name}</span>
                    <span className={toStatusBadgeClass(definition.status)}>{definition.status}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', padding: '0.9rem', display: 'grid', gap: '0.75rem' }}>
              <h3 style={{ fontSize: '0.95rem' }}>Thiết kế quy trình</h3>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--muted)' }}>
                Trường bắt buộc đã chuyển sang chọn từ danh sách để tránh nhập sai cú pháp.
              </p>
              <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '0.6rem' }}>
                <label>
                  Mã quy trình
                  <input value={builderDraft.code} readOnly />
                </label>
                <label>
                  Phân hệ
                  <select
                    value={builderDraft.module}
                    onChange={(event) => setBuilderDraft((prev) => ({ ...prev, module: event.target.value }))}
                  >
                    {MODULE_OPTIONS.map((moduleOption) => (
                      <option key={moduleOption} value={moduleOption}>
                        {moduleOption}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Tên quy trình
                  <input value={builderDraft.name} onChange={(event) => setBuilderDraft((prev) => ({ ...prev, name: event.target.value }))} />
                </label>
                <label>
                  Bước khởi tạo
                  <select
                    value={builderDraft.initialStep}
                    onChange={(event) => setBuilderDraft((prev) => ({ ...prev, initialStep: event.target.value }))}
                  >
                    {builderDraft.steps.map((step) => (
                      <option key={step.id} value={step.key}>
                        {step.name} ({step.key})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Mô tả
                <textarea value={builderDraft.description} onChange={(event) => setBuilderDraft((prev) => ({ ...prev, description: event.target.value }))} />
              </label>

              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <h4 style={{ fontSize: '0.88rem' }}>Sơ đồ bước duyệt</h4>
                {builderDraft.steps.map((step, index) => {
                  const approverTokens = parseApproverTokens(step.approvers);
                  const nextStepOptions = builderDraft.steps.filter((candidate) => candidate.id !== step.id);
                  return (
                    <div key={step.id} style={{ border: '1px dashed var(--line)', borderRadius: 'var(--radius-md)', padding: '0.7rem', display: 'grid', gap: '0.5rem' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                        <label>
                          Mẫu bước
                          <select
                            value={step.templateId}
                            onChange={(event) => {
                              const selectedTemplate = getStepTemplate(event.target.value);
                              setBuilderDraft((prev) => {
                                const nextSteps = prev.steps.map((item, itemIndex) => {
                                  if (itemIndex !== index) {
                                    return item;
                                  }
                                  const nextKey = getUniqueStepKey(selectedTemplate.key, prev.steps, item.id);
                                  return {
                                    ...item,
                                    templateId: selectedTemplate.id,
                                    key: nextKey,
                                    name: selectedTemplate.name
                                  };
                                });
                                const initialStepExists = nextSteps.some((item) => item.key === prev.initialStep);
                                return {
                                  ...prev,
                                  steps: nextSteps,
                                  initialStep: initialStepExists ? prev.initialStep : (nextSteps[0]?.key ?? '')
                                };
                              });
                            }}
                          >
                            {STEP_TEMPLATE_OPTIONS.map((template) => (
                              <option key={template.id} value={template.id}>
                                {template.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Mã bước
                          <input value={step.key} readOnly />
                        </label>
                        <label>
                          Chế độ phê duyệt
                          <select
                            value={step.approvalMode}
                            onChange={(event) =>
                              setBuilderDraft((prev) => ({
                                ...prev,
                                steps: prev.steps.map((item, itemIndex) => (
                                  itemIndex === index ? { ...item, approvalMode: event.target.value as BuilderStep['approvalMode'] } : item
                                ))
                              }))
                            }
                          >
                            <option value="ALL">Toàn bộ (ALL)</option>
                            <option value="ANY">Một trong các bên (ANY)</option>
                            <option value="MIN_N">Tối thiểu N bên (MIN_N)</option>
                          </select>
                        </label>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <label>
                          SLA (giờ)
                          <input
                            type="number"
                            value={step.slaHours}
                            onChange={(event) =>
                              setBuilderDraft((prev) => ({
                                ...prev,
                                steps: prev.steps.map((item, itemIndex) => (
                                  itemIndex === index ? { ...item, slaHours: Number(event.target.value || 24) } : item
                                ))
                              }))
                            }
                          />
                        </label>
                        <label>
                          Số người duyệt tối thiểu
                          <input
                            type="number"
                            value={step.minApprovers}
                            onChange={(event) =>
                              setBuilderDraft((prev) => ({
                                ...prev,
                                steps: prev.steps.map((item, itemIndex) => (
                                  itemIndex === index ? { ...item, minApprovers: Number(event.target.value || 1) } : item
                                ))
                              }))
                            }
                          />
                        </label>
                      </div>

                      <div style={{ display: 'grid', gap: '0.45rem' }}>
                        <label>
                          Người duyệt (chọn từ danh sách)
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.45rem', marginTop: '0.3rem' }}>
                            <select
                              value={stepApproverSelection[step.id] ?? ''}
                              onChange={(event) =>
                                setStepApproverSelection((prev) => ({
                                  ...prev,
                                  [step.id]: event.target.value
                                }))
                              }
                            >
                              <option value="">-- Chọn người duyệt --</option>
                              {approverPresetOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => {
                                const selectedToken = stepApproverSelection[step.id];
                                if (!selectedToken) {
                                  return;
                                }
                                setBuilderDraft((prev) => ({
                                  ...prev,
                                  steps: prev.steps.map((item, itemIndex) => {
                                    if (itemIndex !== index) {
                                      return item;
                                    }
                                    const tokens = parseApproverTokens(item.approvers);
                                    const merged = Array.from(new Set([...tokens, selectedToken]));
                                    return {
                                      ...item,
                                      approvers: merged.join('\n')
                                    };
                                  })
                                }));
                              }}
                            >
                              Thêm
                            </button>
                          </div>
                        </label>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {approverTokens.length === 0 && <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Chưa có người duyệt.</span>}
                          {approverTokens.map((token) => {
                            const isRoleToken = token.toUpperCase().startsWith('ROLE:');
                            const user = usersById.get(token);
                            const label = isRoleToken
                              ? `Vai trò ${token.slice('ROLE:'.length)}`
                              : (user ? `${user.employee?.fullName || user.email}` : token);
                            return (
                              <button
                                key={`${step.id}-${token}`}
                                type="button"
                                className="btn btn-ghost"
                                style={{ padding: '0.2rem 0.45rem', fontSize: '0.78rem' }}
                                onClick={() =>
                                  setBuilderDraft((prev) => ({
                                    ...prev,
                                    steps: prev.steps.map((item, itemIndex) => {
                                      if (itemIndex !== index) {
                                        return item;
                                      }
                                      const nextTokens = parseApproverTokens(item.approvers).filter((current) => current !== token);
                                      return { ...item, approvers: nextTokens.join('\n') };
                                    })
                                  }))
                                }
                              >
                                {label} ×
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <label>
                          Khi phê duyệt chuyển đến
                          <select
                            value={step.approveToStep}
                            onChange={(event) =>
                              setBuilderDraft((prev) => ({
                                ...prev,
                                steps: prev.steps.map((item, itemIndex) => (
                                  itemIndex === index ? { ...item, approveToStep: event.target.value } : item
                                ))
                              }))
                            }
                          >
                            <option value="">Kết thúc tại trạng thái cuối</option>
                            {nextStepOptions.map((candidate) => (
                              <option key={candidate.id} value={candidate.key}>
                                {candidate.name} ({candidate.key})
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Trạng thái kết thúc khi phê duyệt
                          <select
                            value={step.approveTerminalStatus}
                            disabled={Boolean(step.approveToStep)}
                            onChange={(event) =>
                              setBuilderDraft((prev) => ({
                                ...prev,
                                steps: prev.steps.map((item, itemIndex) => (
                                  itemIndex === index ? { ...item, approveTerminalStatus: event.target.value as WorkflowStatus } : item
                                ))
                              }))
                            }
                          >
                            {TERMINAL_STATUS_OPTIONS.map((statusOption) => (
                              <option key={statusOption} value={statusOption}>
                                {statusOption}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <label>
                          Khi từ chối chuyển đến
                          <select
                            value={step.rejectToStep}
                            onChange={(event) =>
                              setBuilderDraft((prev) => ({
                                ...prev,
                                steps: prev.steps.map((item, itemIndex) => (
                                  itemIndex === index ? { ...item, rejectToStep: event.target.value } : item
                                ))
                              }))
                            }
                          >
                            <option value="">Kết thúc tại trạng thái cuối</option>
                            {nextStepOptions.map((candidate) => (
                              <option key={candidate.id} value={candidate.key}>
                                {candidate.name} ({candidate.key})
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Trạng thái kết thúc khi từ chối
                          <select
                            value={step.rejectTerminalStatus}
                            disabled={Boolean(step.rejectToStep)}
                            onChange={(event) =>
                              setBuilderDraft((prev) => ({
                                ...prev,
                                steps: prev.steps.map((item, itemIndex) => (
                                  itemIndex === index ? { ...item, rejectTerminalStatus: event.target.value as WorkflowStatus } : item
                                ))
                              }))
                            }
                          >
                            {TERMINAL_STATUS_OPTIONS.map((statusOption) => (
                              <option key={statusOption} value={statusOption}>
                                {statusOption}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          className="btn btn-ghost"
                          type="button"
                          onClick={() =>
                            setBuilderDraft((prev) => {
                              const nextSteps = prev.steps.filter((_, itemIndex) => itemIndex !== index);
                              const nextInitialStep = nextSteps.some((item) => item.key === prev.initialStep)
                                ? prev.initialStep
                                : (nextSteps[0]?.key ?? '');
                              return {
                                ...prev,
                                steps: nextSteps,
                                initialStep: nextInitialStep
                              };
                            })
                          }
                          disabled={builderDraft.steps.length <= 1}
                        >
                          Xóa bước
                        </button>
                      </div>
                    </div>
                  );
                })}
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() =>
                    setBuilderDraft((prev) => ({
                      ...prev,
                      steps: [
                        ...prev.steps,
                        (() => {
                          const template = STEP_TEMPLATE_OPTIONS[Math.min(prev.steps.length, STEP_TEMPLATE_OPTIONS.length - 1)];
                          const newStep = createStepFromTemplate(template.id);
                          return {
                            ...newStep,
                            key: getUniqueStepKey(newStep.key, prev.steps)
                          };
                        })()
                      ]
                    }))
                  }
                >
                  + Thêm bước
                </button>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => void onSaveDraft()} disabled={isBusy}>
                  <CheckCircle2 size={14} />
                  Lưu nháp
                </button>
                <button className="btn btn-ghost" onClick={() => void onValidateDefinition()} disabled={isBusy}>
                  Kiểm tra
                </button>
                <button className="btn btn-ghost" onClick={() => void onPublishOrArchiveDefinition('publish')} disabled={isBusy}>
                  Kích hoạt
                </button>
                <button className="btn btn-ghost" onClick={() => void onPublishOrArchiveDefinition('archive')} disabled={isBusy}>
                  Lưu trữ
                </button>
              </div>

              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <label>
                  Kịch bản mô phỏng
                  <select value={simulateActions} onChange={(event) => setSimulateActions(event.target.value)}>
                    {SIMULATE_ACTION_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="btn btn-ghost" onClick={() => void onSimulateDefinition()} disabled={isBusy}>
                  Chạy mô phỏng
                </button>
              </div>

              {simulationResult !== null && (
                <pre style={{ margin: 0, padding: '0.75rem', border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', maxHeight: '220px', overflow: 'auto' }}>
                  {JSON.stringify(simulationResult, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'monitor' && (
        <section className="feature-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Giám sát phiên chạy quy trình</h2>
            <span style={{ color: 'var(--muted)', fontSize: '0.8125rem' }}>{monitorRows.length} phiên</span>
          </div>
          <StandardDataTable
            data={monitorRows}
            columns={monitorColumns}
            storageKey="erp-workflows-monitor"
            isLoading={isBusy}
            pageInfo={{
              currentPage: monitorTablePager.currentPage,
              hasPrevPage: monitorTablePager.hasPrevPage,
              hasNextPage: monitorTablePager.hasNextPage,
              visitedPages: monitorTablePager.visitedPages
            }}
            sortMeta={
              monitorSortMeta ?? {
                sortBy: monitorSortBy,
                sortDir: monitorSortDir,
                sortableFields: []
              }
            }
            onPageNext={monitorTablePager.goNextPage}
            onPagePrev={monitorTablePager.goPrevPage}
            onJumpVisitedPage={monitorTablePager.jumpVisitedPage}
            onSortChange={(sortBy, sortDir) => {
              setMonitorSortBy(sortBy);
              setMonitorSortDir(sortDir);
            }}
            onRowClick={(row) => void openMonitorDetail(row.id)}
            enableRowSelection
            selectedRowIds={selectedMonitorRowIds}
            onSelectedRowIdsChange={setSelectedMonitorRowIds}
            showDefaultBulkUtilities
          />
        </section>
      )}

      <SidePanel
        isOpen={Boolean(pendingInboxBulkAction)}
        title={pendingInboxBulkAction ? `Xử lý hàng loạt ${workflowActionLabel(pendingInboxBulkAction.action)} (${pendingInboxBulkAction.rows.length})` : 'Xử lý tác vụ hàng loạt'}
        onClose={closePendingInboxBulkAction}
      >
        {pendingInboxBulkAction && (
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              void submitPendingInboxBulkAction();
            }}
          >
            <p style={{ fontSize: '0.8125rem', color: 'var(--muted)' }}>
              Áp dụng <strong>{workflowActionLabel(pendingInboxBulkAction.action)}</strong> cho <strong>{pendingInboxBulkAction.rows.length}</strong> tác vụ đã chọn.
            </p>
            {(pendingInboxBulkAction.action === 'delegate' || pendingInboxBulkAction.action === 'reassign') && (
              <label>
                Người nhận mới
                <select value={bulkTaskTargetApprover} onChange={(event) => setBulkTaskTargetApprover(event.target.value)}>
                  <option value="">-- Chọn người nhận --</option>
                  {approverPresetOptions.map((option) => (
                    <option key={`bulk-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Ghi chú chung
              <textarea value={bulkTaskNote} onChange={(event) => setBulkTaskNote(event.target.value)} />
            </label>
            <button className="btn btn-primary" type="submit" disabled={isRunningInboxBulkAction}>
              {isRunningInboxBulkAction ? 'Đang xử lý...' : 'Xác nhận'}
            </button>
          </form>
        )}
      </SidePanel>

      <SidePanel
        isOpen={Boolean(selectedTask)}
        title="Xử lý tác vụ phê duyệt"
        onClose={() => {
          setSelectedTask(null);
          setTaskNote('');
          setTaskTargetApprover('');
        }}
      >
        {selectedTask && (
          <form className="form-grid" onSubmit={onRunTaskAction}>
            <p style={{ fontSize: '0.8125rem', color: 'var(--muted)' }}>
              Tác vụ: <strong>{selectedTask.id}</strong> | Bước: <strong>{selectedTask.stepKey ?? '--'}</strong>
            </p>
            <label>
              Hành động
              <select value={taskAction} onChange={(event) => setTaskAction(event.target.value as WorkflowTaskAction)}>
                <option value="approve">Phê duyệt</option>
                <option value="reject">Từ chối</option>
                <option value="delegate">Uỷ quyền</option>
                <option value="reassign">Chuyển người xử lý</option>
              </select>
            </label>
            {(taskAction === 'delegate' || taskAction === 'reassign') && (
              <label>
                Người nhận mới
                <select value={taskTargetApprover} onChange={(event) => setTaskTargetApprover(event.target.value)}>
                  <option value="">-- Chọn người nhận --</option>
                  {approverPresetOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Ghi chú
              <textarea value={taskNote} onChange={(event) => setTaskNote(event.target.value)} />
            </label>
            <button className="btn btn-primary" type="submit" disabled={isBusy}>
              Xác nhận
            </button>
          </form>
        )}
      </SidePanel>

      <SidePanel
        isOpen={Boolean(selectedInstance)}
        title="Chi tiết phiên quy trình"
        onClose={() => setSelectedInstance(null)}
      >
        {selectedInstance && (
          <div style={{ display: 'grid', gap: '0.85rem' }}>
            <p style={{ margin: 0 }}>
              <strong>ID:</strong> {selectedInstance.id}
            </p>
            <p style={{ margin: 0 }}>
              <strong>Định nghĩa:</strong> {selectedInstance.definition?.name ?? selectedInstance.definitionId}
            </p>
            <p style={{ margin: 0 }}>
              <strong>Bước hiện tại:</strong> {selectedInstance.currentStep ?? '--'}
            </p>
            <p style={{ margin: 0 }}>
              <strong>Trạng thái:</strong> {selectedInstance.status}
            </p>
            <h4 style={{ margin: '0.25rem 0 0', fontSize: '0.9rem' }}>Dòng thời gian</h4>
            <div style={{ display: 'grid', gap: '0.55rem' }}>
              {(selectedInstance.actionLogs ?? []).map((log) => (
                <div key={log.id} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', padding: '0.6rem' }}>
                  <p style={{ margin: 0, fontSize: '0.82rem' }}>
                    <strong>{log.action}</strong> | {formatDate(log.createdAt)}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>
                    {log.fromStep ?? '--'} {'->'} {log.toStep ?? '--'} | người xử lý: {log.actorId ?? '--'}
                  </p>
                  {log.note ? <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem' }}>{log.note}</p> : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </SidePanel>
    </article>
  );
}
