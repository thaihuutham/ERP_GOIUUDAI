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

export const projectsModule: ModuleDefinition = {
    key: 'projects',
    title: 'Dự án',
    summary: 'Board dự án chuyên sâu: điều phối tiến độ, nguồn lực, ngân sách và giờ công.',
    highlights: ['Danh mục dự án', 'Task pipeline', 'Nguồn lực và ngân sách'],
    features: [
      {
        key: 'project-list',
        title: 'Danh mục dự án',
        description: 'Tạo và cập nhật danh mục dự án.',
        listEndpoint: '/projects',
        columns: ['id', 'code', 'name', 'status', 'plannedBudget', 'actualBudget', 'forecastPercent', 'startAt', 'endAt'],
        filters: [
          {
            key: 'status',
            label: 'Trạng thái',
            type: 'select',
            options: STATUS_OPTIONS
          }
        ],
        actions: [
          {
            key: 'create-project',
            label: 'Tạo dự án',
            method: 'POST',
            endpoint: '/projects',
            fields: [
              { name: 'code', label: 'Mã dự án' },
              { name: 'name', label: 'Tên dự án', required: true },
              { name: 'description', label: 'Mô tả', type: 'textarea' },
              { name: 'startAt', label: 'Bắt đầu', type: 'date' },
              { name: 'endAt', label: 'Kết thúc', type: 'date' },
              { name: 'plannedBudget', label: 'Ngân sách kế hoạch', type: 'number' },
              { name: 'actualBudget', label: 'Ngân sách thực tế', type: 'number' },
              { name: 'forecastPercent', label: 'Forecast (%)', type: 'number' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'PENDING' }
            ]
          },
          {
            key: 'update-project',
            label: 'Cập nhật dự án',
            method: 'PATCH',
            endpoint: '/projects/:id',
            fields: [
              { name: 'id', label: 'Mã dự án', required: true },
              { name: 'name', label: 'Tên mới' },
              { name: 'description', label: 'Mô tả', type: 'textarea' },
              { name: 'startAt', label: 'Bắt đầu', type: 'date' },
              { name: 'endAt', label: 'Kết thúc', type: 'date' },
              { name: 'plannedBudget', label: 'Ngân sách kế hoạch', type: 'number' },
              { name: 'actualBudget', label: 'Ngân sách thực tế', type: 'number' },
              { name: 'forecastPercent', label: 'Forecast (%)', type: 'number' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          },
          {
            key: 'update-project-forecast',
            label: 'Cập nhật forecast',
            method: 'PATCH',
            endpoint: '/projects/:id/forecast',
            fields: [
              { name: 'id', label: 'Mã dự án', required: true },
              { name: 'forecastPercent', label: 'Forecast (%)', type: 'number', required: true },
              { name: 'actualBudget', label: 'Ngân sách thực tế', type: 'number' },
              {
                name: 'reason',
                label: 'Lý do cập nhật',
                type: 'select',
                required: true,
                options: [
                  { label: 'Cập nhật định kỳ', value: 'PERIODIC_REVIEW' },
                  { label: 'Điều chỉnh kế hoạch', value: 'PLAN_ADJUSTMENT' },
                  { label: 'Biến động nguồn lực', value: 'RESOURCE_CHANGE' }
                ],
                defaultValue: 'PERIODIC_REVIEW'
              },
              { name: 'reference', label: 'Mã tham chiếu', required: true, placeholder: 'PRJ-FC-001' }
            ]
          }
        ]
      },
      {
        key: 'project-tasks',
        title: 'Bảng công việc',
        description: 'Quản lý công việc theo từng dự án.',
        listEndpoint: '/projects/tasks',
        columns: ['id', 'projectId', 'title', 'assignedTo', 'status', 'dueAt'],
        filters: [
          {
            key: 'projectId',
            label: 'Dự án',
            type: 'select',
            queryParam: 'projectId',
            optionSource: {
              endpoint: '/projects',
              valueField: 'id',
              labelField: 'name',
              limit: 100
            }
          },
          {
            key: 'status',
            label: 'Trạng thái',
            type: 'select',
            options: PROJECT_TASK_STATUS_OPTIONS,
            queryParam: 'status'
          }
        ],
        actions: [
          {
            key: 'create-task',
            label: 'Tạo công việc',
            method: 'POST',
            endpoint: '/projects/tasks',
            fields: [
              {
                name: 'projectId',
                label: 'Dự án',
                type: 'select',
                required: true,
                optionSource: {
                  endpoint: '/projects',
                  valueField: 'id',
                  labelField: 'name',
                  limit: 100
                }
              },
              { name: 'title', label: 'Tiêu đề công việc', required: true },
              {
                name: 'assignedTo',
                label: 'Người phụ trách',
                type: 'select',
                optionSource: {
                  endpoint: '/hr/employees',
                  valueField: 'id',
                  labelField: 'fullName',
                  limit: 100
                }
              },
              { name: 'dueAt', label: 'Hạn hoàn thành', type: 'date' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'PENDING' }
            ]
          },
          {
            key: 'update-task-status',
            label: 'Đổi trạng thái công việc',
            method: 'POST',
            endpoint: '/projects/tasks/:id/status',
            fields: [
              { name: 'id', label: 'Mã công việc', required: true },
              { name: 'status', label: 'Trạng thái', type: 'select', required: true, options: STATUS_OPTIONS, defaultValue: 'APPROVED' }
            ]
          }
        ]
      },
      {
        key: 'project-resources',
        title: 'Phân bổ nguồn lực',
        description: 'Phân bổ nguồn lực theo dự án.',
        listEndpoint: '/projects/resources',
        columns: ['id', 'projectId', 'resourceType', 'resourceRef', 'quantity'],
        filters: [
          {
            key: 'projectId',
            label: 'Dự án',
            type: 'select',
            queryParam: 'projectId',
            optionSource: {
              endpoint: '/projects',
              valueField: 'id',
              labelField: 'name',
              limit: 100
            }
          }
        ],
        actions: [
          {
            key: 'create-resource',
            label: 'Thêm nguồn lực',
            method: 'POST',
            endpoint: '/projects/resources',
            fields: [
              {
                name: 'projectId',
                label: 'Dự án',
                type: 'select',
                required: true,
                optionSource: {
                  endpoint: '/projects',
                  valueField: 'id',
                  labelField: 'name',
                  limit: 100
                }
              },
              { name: 'resourceType', label: 'Loại nguồn lực', type: 'select', required: true, options: PROJECT_RESOURCE_TYPE_OPTIONS },
              { name: 'resourceRef', label: 'Mã tham chiếu nguồn lực' },
              { name: 'quantity', label: 'Số lượng', type: 'number' }
            ]
          }
        ]
      },
      {
        key: 'project-budgets',
        title: 'Ngân sách dự án',
        description: 'Quản lý ngân sách chi tiết theo dự án.',
        listEndpoint: '/projects/budgets',
        columns: ['id', 'projectId', 'budgetType', 'amount'],
        filters: [
          {
            key: 'projectId',
            label: 'Dự án',
            type: 'select',
            queryParam: 'projectId',
            optionSource: {
              endpoint: '/projects',
              valueField: 'id',
              labelField: 'name',
              limit: 100
            }
          }
        ],
        actions: [
          {
            key: 'create-project-budget',
            label: 'Thêm ngân sách',
            method: 'POST',
            endpoint: '/projects/budgets',
            fields: [
              {
                name: 'projectId',
                label: 'Dự án',
                type: 'select',
                required: true,
                optionSource: {
                  endpoint: '/projects',
                  valueField: 'id',
                  labelField: 'name',
                  limit: 100
                }
              },
              { name: 'budgetType', label: 'Loại ngân sách', type: 'select', required: true, options: PROJECT_BUDGET_TYPE_OPTIONS },
              { name: 'amount', label: 'Số tiền', type: 'number', required: true }
            ]
          }
        ]
      },
      {
        key: 'time-entries',
        title: 'Bảng công',
        description: 'Theo dõi giờ công nhân sự theo dự án.',
        listEndpoint: '/projects/time-entries',
        columns: ['id', 'projectId', 'employeeId', 'workDate', 'hours', 'note'],
        filters: [
          {
            key: 'projectId',
            label: 'Dự án',
            type: 'select',
            queryParam: 'projectId',
            optionSource: {
              endpoint: '/projects',
              valueField: 'id',
              labelField: 'name',
              limit: 100
            }
          }
        ],
        actions: [
          {
            key: 'create-time-entry',
            label: 'Tạo bản ghi công',
            method: 'POST',
            endpoint: '/projects/time-entries',
            fields: [
              {
                name: 'projectId',
                label: 'Dự án',
                type: 'select',
                optionSource: {
                  endpoint: '/projects',
                  valueField: 'id',
                  labelField: 'name',
                  limit: 100
                }
              },
              {
                name: 'employeeId',
                label: 'Nhân viên',
                type: 'select',
                required: true,
                optionSource: {
                  endpoint: '/hr/employees',
                  valueField: 'id',
                  labelField: 'fullName',
                  limit: 100
                }
              },
              { name: 'workDate', label: 'Ngày làm', type: 'date', required: true },
              { name: 'hours', label: 'Số giờ', type: 'number', required: true },
              { name: 'note', label: 'Ghi chú', type: 'textarea' }
            ]
          }
        ]
      }
    ]
  };
