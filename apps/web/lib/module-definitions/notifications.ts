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

export const notificationsModule: ModuleDefinition = {
    key: 'notifications',
    title: 'Thông báo',
    summary: 'Board thông báo chuyên sâu: gửi thông báo nội bộ, vận hành dispatch và cập nhật trạng thái đọc.',
    highlights: ['Inbox thông báo', 'Dispatch theo lịch', 'Bulk đánh dấu đã đọc'],
    features: [
      {
        key: 'notification-center',
        title: 'Trung tâm thông báo',
        description: 'Danh sách thông báo và trạng thái đã đọc/chưa đọc.',
        listEndpoint: '/notifications',
        columns: ['id', 'userId', 'title', 'content', 'isRead', 'createdAt'],
        filters: [
          {
            key: 'userId',
            label: 'Người nhận',
            type: 'select',
            optionSource: {
              endpoint: '/hr/employees',
              valueField: 'id',
              labelField: 'fullName',
              limit: 100
            }
          },
          {
            key: 'unreadOnly',
            label: 'Chỉ chưa đọc',
            type: 'checkbox',
            includeInQuery: true
          }
        ],
        actions: [
          {
            key: 'create-notification',
            label: 'Tạo thông báo',
            method: 'POST',
            endpoint: '/notifications',
            fields: [
              {
                name: 'userId',
                label: 'Người nhận (để trống = broadcast)',
                type: 'select',
                optionSource: {
                  endpoint: '/hr/employees',
                  valueField: 'id',
                  labelField: 'fullName',
                  limit: 100
                }
              },
              { name: 'title', label: 'Tiêu đề', required: true },
              { name: 'content', label: 'Nội dung', type: 'textarea' }
            ]
          },
          {
            key: 'run-notification-dispatch',
            label: 'Chạy dispatch đến hạn',
            method: 'POST',
            endpoint: '/notifications/dispatch/run-due',
            fields: [
              { name: 'limit', label: 'Số bản ghi xử lý', type: 'number', defaultValue: 100 },
              {
                name: 'reason',
                label: 'Lý do chạy thủ công',
                type: 'select',
                required: true,
                options: [
                  { label: 'Kiểm tra vận hành', value: 'OPS_CHECK' },
                  { label: 'Bù job thất bại', value: 'RETRY_RECOVERY' }
                ],
                defaultValue: 'OPS_CHECK'
              },
              { name: 'reference', label: 'Mã tham chiếu', required: true, placeholder: 'NTF-DISPATCH-001' }
            ]
          },
          {
            key: 'mark-read',
            label: 'Đánh dấu đã đọc',
            method: 'POST',
            endpoint: '/notifications/:id/read',
            fields: [{ name: 'id', label: 'Mã thông báo', required: true }]
          }
        ]
      }
    ]
  };
