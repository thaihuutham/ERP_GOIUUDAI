import type { ModuleDefinition } from '../module-ui';
import {
  STATUS_OPTIONS,
  ATTENDANCE_METHOD_OPTIONS,
  PRODUCT_TYPE_OPTIONS,
  ASSET_LIFECYCLE_OPTIONS,
  ASSET_LIFECYCLE_ACTION_OPTIONS,
  ASSET_DEPRECIATION_METHOD_OPTIONS,
  PROJECT_RESOURCE_TYPE_OPTIONS,
  PROJECT_BUDGET_TYPE_OPTIONS,
  PROJECT_TASK_STATUS_OPTIONS,
  REPORT_MODULE_OPTIONS,
  REPORT_OUTPUT_FORMAT_OPTIONS,
  REPORT_SCHEDULE_RULE_OPTIONS,
  REPORT_GROUP_BY_OPTIONS
} from './shared-options';

export const workflowsModule: ModuleDefinition = {
    key: 'workflows',
    title: 'Quy trình',
    summary: 'Định nghĩa quy trình và theo dõi phiên duyệt nghiệp vụ.',
    highlights: ['Phiên bản quy trình', 'Theo dõi thực thi', 'Lưu vết phê duyệt'],
    features: [
      {
        key: 'workflow-definitions',
        title: 'Định nghĩa quy trình',
        description: 'Mẫu quy trình theo từng phân hệ. Tạo mới tại màn builder chuyên dụng /modules/workflows.',
        listEndpoint: '/workflows/definitions',
        columns: ['id', 'code', 'name', 'module', 'version', 'status'],
        actions: [
          {
            key: 'update-definition',
            label: 'Cập nhật định nghĩa',
            method: 'PATCH',
            endpoint: '/workflows/definitions/:id',
            fields: [
              { name: 'id', label: 'Mã định nghĩa', required: true },
              { name: 'name', label: 'Tên mới' },
              { name: 'module', label: 'Phân hệ' },
              { name: 'version', label: 'Phiên bản', type: 'number' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          }
        ]
      },
      {
        key: 'workflow-instances',
        title: 'Phiên chạy quy trình',
        description: 'Theo dõi thực thi từng quy trình.',
        listEndpoint: '/workflows/instances',
        columns: ['id', 'definitionId', 'targetType', 'targetId', 'currentStep', 'status', 'startedBy'],
        actions: [
          {
            key: 'create-instance',
            label: 'Tạo phiên chạy',
            method: 'POST',
            endpoint: '/workflows/instances',
            fields: [
              { name: 'definitionId', label: 'Mã định nghĩa', required: true },
              { name: 'targetType', label: 'Loại đối tượng', required: true },
              { name: 'targetId', label: 'Mã đối tượng', required: true },
              { name: 'currentStep', label: 'Bước hiện tại' },
              { name: 'startedBy', label: 'Người khởi chạy' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'PENDING' }
            ]
          },
          {
            key: 'update-instance',
            label: 'Cập nhật phiên chạy',
            method: 'PATCH',
            endpoint: '/workflows/instances/:id',
            fields: [
              { name: 'id', label: 'Mã phiên chạy', required: true },
              { name: 'currentStep', label: 'Bước hiện tại' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          }
        ]
      },
      {
        key: 'workflow-approvals',
        title: 'Sổ phê duyệt',
        description: 'Nhật ký phê duyệt theo quy trình.',
        listEndpoint: '/workflows/approvals',
        columns: ['id', 'targetType', 'targetId', 'requesterId', 'approverId', 'status', 'decidedAt'],
        actions: [
          {
            key: 'create-approval',
            label: 'Tạo bản ghi phê duyệt',
            method: 'POST',
            endpoint: '/workflows/approvals',
            fields: [
              { name: 'targetType', label: 'Loại đối tượng', required: true },
              { name: 'targetId', label: 'Mã đối tượng', required: true },
              { name: 'requesterId', label: 'Mã người yêu cầu', required: true },
              { name: 'approverId', label: 'Mã người duyệt' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'PENDING' }
            ]
          },
          {
            key: 'update-approval',
            label: 'Cập nhật phê duyệt',
            method: 'PATCH',
            endpoint: '/workflows/approvals/:id',
            fields: [
              { name: 'id', label: 'Mã phê duyệt', required: true },
              { name: 'approverId', label: 'Mã người duyệt' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS },
              { name: 'decidedAt', label: 'Thời điểm quyết định', type: 'datetime-local' }
            ]
          }
        ]
      }
    ]
  };
