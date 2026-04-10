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

export const assetsModule: ModuleDefinition = {
    key: 'assets',
    title: 'Tài sản',
    summary: 'Board tài sản chuyên sâu: theo dõi vòng đời, cấp phát/thu hồi và khấu hao.',
    highlights: ['Kho tài sản', 'Lifecycle transition', 'Bulk cấp phát/thu hồi'],
    features: [
      {
        key: 'asset-inventory',
        title: 'Kho tài sản',
        description: 'Quản lý danh sách tài sản với bộ lọc trạng thái và vòng đời.',
        listEndpoint: '/assets',
        columns: ['id', 'assetCode', 'name', 'category', 'lifecycleStatus', 'value', 'status', 'purchaseAt', 'createdAt'],
        filters: [
          {
            key: 'status',
            label: 'Trạng thái',
            type: 'select',
            options: STATUS_OPTIONS
          },
          {
            key: 'lifecycleStatus',
            label: 'Vòng đời',
            type: 'select',
            options: ASSET_LIFECYCLE_OPTIONS
          }
        ],
        actions: [
          {
            key: 'create-asset',
            label: 'Tạo tài sản',
            method: 'POST',
            endpoint: '/assets',
            fields: [
              { name: 'assetCode', label: 'Mã tài sản' },
              { name: 'name', label: 'Tên tài sản', required: true },
              { name: 'category', label: 'Nhóm tài sản' },
              { name: 'purchaseAt', label: 'Ngày mua', type: 'date' },
              { name: 'value', label: 'Giá trị', type: 'number' },
              {
                name: 'lifecycleStatus',
                label: 'Vòng đời',
                type: 'select',
                options: ASSET_LIFECYCLE_OPTIONS,
                defaultValue: 'PROCURE'
              },
              {
                name: 'depreciationMethod',
                label: 'Phương pháp khấu hao',
                type: 'select',
                options: ASSET_DEPRECIATION_METHOD_OPTIONS,
                defaultValue: 'STRAIGHT_LINE'
              },
              { name: 'usefulLifeMonths', label: 'Thời gian sử dụng (tháng)', type: 'number' },
              { name: 'salvageValue', label: 'Giá trị thu hồi', type: 'number' },
              { name: 'depreciationStartAt', label: 'Ngày bắt đầu khấu hao', type: 'date' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'ACTIVE' }
            ]
          },
          {
            key: 'update-asset',
            label: 'Cập nhật tài sản',
            method: 'PATCH',
            endpoint: '/assets/:id',
            fields: [
              { name: 'id', label: 'Mã tài sản', required: true },
              { name: 'name', label: 'Tên mới' },
              { name: 'category', label: 'Nhóm' },
              { name: 'purchaseAt', label: 'Ngày mua', type: 'date' },
              { name: 'value', label: 'Giá trị', type: 'number' },
              {
                name: 'lifecycleStatus',
                label: 'Vòng đời',
                type: 'select',
                options: ASSET_LIFECYCLE_OPTIONS
              },
              {
                name: 'depreciationMethod',
                label: 'Phương pháp khấu hao',
                type: 'select',
                options: ASSET_DEPRECIATION_METHOD_OPTIONS
              },
              { name: 'usefulLifeMonths', label: 'Thời gian sử dụng (tháng)', type: 'number' },
              { name: 'salvageValue', label: 'Giá trị thu hồi', type: 'number' },
              { name: 'depreciationStartAt', label: 'Ngày bắt đầu khấu hao', type: 'date' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          },
          {
            key: 'transition-asset-lifecycle',
            label: 'Chuyển vòng đời',
            method: 'POST',
            endpoint: '/assets/:id/lifecycle',
            fields: [
              { name: 'id', label: 'Mã tài sản', required: true },
              {
                name: 'action',
                label: 'Thao tác vòng đời',
                type: 'select',
                required: true,
                options: ASSET_LIFECYCLE_ACTION_OPTIONS,
                defaultValue: 'ACTIVATE'
              },
              { name: 'reason', label: 'Lý do', type: 'select', required: true, options: [
                { label: 'Điều chuyển nội bộ', value: 'INTERNAL_TRANSFER' },
                { label: 'Sự cố kỹ thuật', value: 'TECHNICAL_ISSUE' },
                { label: 'Ngừng khai thác', value: 'RETIREMENT' }
              ], defaultValue: 'INTERNAL_TRANSFER' },
              { name: 'reference', label: 'Mã tham chiếu', required: true, placeholder: 'AST-LFC-001' },
              { name: 'note', label: 'Ghi chú', type: 'textarea' }
            ]
          },
          {
            key: 'allocate-asset',
            label: 'Cấp phát tài sản',
            method: 'POST',
            endpoint: '/assets/:id/allocate',
            fields: [
              { name: 'id', label: 'Mã tài sản', required: true },
              {
                name: 'employeeId',
                label: 'Nhân viên nhận tài sản',
                type: 'select',
                required: true,
                optionSource: {
                  endpoint: '/hr/employees',
                  valueField: 'id',
                  labelField: 'fullName',
                  limit: 100
                }
              },
              { name: 'note', label: 'Ghi chú', type: 'textarea' }
            ]
          },
          {
            key: 'return-asset',
            label: 'Thu hồi tài sản',
            method: 'POST',
            endpoint: '/assets/:id/return',
            fields: [
              { name: 'id', label: 'Mã tài sản', required: true },
              {
                name: 'reason',
                label: 'Lý do thu hồi',
                type: 'select',
                required: true,
                options: [
                  { label: 'Hết nhu cầu sử dụng', value: 'NO_LONGER_NEEDED' },
                  { label: 'Luân chuyển tài sản', value: 'REASSIGNMENT' },
                  { label: 'Thiết bị lỗi/bảo trì', value: 'MAINTENANCE_REQUIRED' }
                ],
                defaultValue: 'NO_LONGER_NEEDED'
              },
              { name: 'reference', label: 'Mã tham chiếu', required: true, placeholder: 'AST-RET-001' },
              { name: 'notes', label: 'Ghi chú', type: 'textarea' }
            ]
          },
          {
            key: 'post-asset-depreciation',
            label: 'Ghi nhận khấu hao',
            method: 'POST',
            endpoint: '/assets/:id/depreciation/post',
            fields: [
              { name: 'id', label: 'Mã tài sản', required: true },
              { name: 'period', label: 'Kỳ ghi nhận (YYYY-MM)', placeholder: '2026-04' },
              { name: 'amount', label: 'Số tiền khấu hao', type: 'number' },
              {
                name: 'reason',
                label: 'Lý do override',
                type: 'select',
                required: true,
                options: [
                  { label: 'Ghi nhận định kỳ', value: 'PERIODIC_POSTING' },
                  { label: 'Điều chỉnh thủ công', value: 'MANUAL_ADJUSTMENT' }
                ],
                defaultValue: 'PERIODIC_POSTING'
              },
              { name: 'reference', label: 'Mã tham chiếu', required: true, placeholder: 'AST-DEP-001' },
              { name: 'note', label: 'Ghi chú', type: 'textarea' }
            ]
          }
        ]
      },
      {
        key: 'asset-allocations',
        title: 'Lịch sử cấp phát',
        description: 'Lịch sử cấp phát và hoàn trả.',
        listEndpoint: '/assets/allocations',
        columns: ['id', 'assetId', 'employeeId', 'allocatedAt', 'returnedAt', 'status'],
        filters: [
          {
            key: 'assetId',
            label: 'Tài sản',
            type: 'select',
            optionSource: {
              endpoint: '/assets',
              valueField: 'id',
              labelField: 'name',
              limit: 100
            }
          }
        ],
        actions: []
      }
    ]
  };
