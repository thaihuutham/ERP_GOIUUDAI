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

export const settingsModule: ModuleDefinition = {
    key: 'settings',
    title: 'Cấu hình hệ thống',
    summary: 'Quản trị cấu hình vận hành và chính sách điều hành tập trung.',
    highlights: ['Cấu hình hệ thống', 'Chính sách vận hành', 'Đồng bộ dữ liệu BHTOT'],
    features: [
      {
        key: 'system-config',
        title: 'Cấu hình hệ thống',
        description: 'Cấu hình vận hành chính cho tổ chức.',
        listEndpoint: '/settings/config',
        view: 'object',
        actions: [
          {
            key: 'save-system-config',
            label: 'Lưu cấu hình hệ thống',
            method: 'PUT',
            endpoint: '/settings/config',
            fields: [
              { name: 'companyName', label: 'Tên công ty' },
              { name: 'taxCode', label: 'Mã số thuế' },
              { name: 'address', label: 'Địa chỉ' },
              { name: 'currency', label: 'Tiền tệ', defaultValue: 'VND' },
              { name: 'dateFormat', label: 'Định dạng ngày', defaultValue: 'DD/MM/YYYY' }
            ]
          }
        ]
      },
      {
        key: 'bhtot-sync',
        title: 'Đồng bộ dữ liệu BHTOT',
        description:
          'Thiết lập kết nối API và đồng bộ một chiều dữ liệu đơn hàng, CTV, xe, nhân viên từ BHTOT vào hệ thống.',
        listEndpoint: '/settings/bhtot/sync/status',
        view: 'object',
        actions: [
          {
            key: 'save-bhtot-sync-config',
            label: 'Lưu cấu hình đồng bộ',
            method: 'PUT',
            endpoint: '/settings/bhtot/sync/config',
            fields: [
              { name: 'enabled', label: 'Bật đồng bộ', type: 'checkbox', defaultValue: false },
              { name: 'baseUrl', label: 'Địa chỉ máy chủ BHTOT (Base URL)', required: true, placeholder: 'http://localhost:8080' },
              { name: 'apiKey', label: 'Khóa API', required: true, placeholder: 'bhtot_api_secret' },
              { name: 'timeoutMs', label: 'Thời gian chờ (ms)', type: 'number', defaultValue: 12000 },
              { name: 'ordersStateKey', label: 'Mã trạng thái đơn hàng', defaultValue: 'bhtot_orders' },
              { name: 'usersStateKey', label: 'Mã trạng thái người dùng', defaultValue: 'bhtot_users' },
              { name: 'syncAllUsersAsEmployees', label: 'Đồng bộ tất cả người dùng thành nhân viên', type: 'checkbox', defaultValue: false }
            ]
          },
          {
            key: 'run-bhtot-sync',
            label: 'Chạy đồng bộ ngay',
            method: 'POST',
            endpoint: '/settings/bhtot/sync/run',
            fields: []
          }
        ]
      },
      {
        key: 'raw-settings',
        title: 'Thiết lập nâng cao',
        description: 'Danh sách cặp khóa - giá trị để mở rộng cấu hình.',
        listEndpoint: '/settings',
        columns: ['id', 'settingKey', 'settingValue', 'createdAt'],
        actions: [
          {
            key: 'upsert-setting',
            label: 'Lưu thiết lập',
            method: 'POST',
            endpoint: '/settings',
            fields: [
              { name: 'settingKey', label: 'Mã thiết lập', required: true },
              { name: 'settingValue', label: 'Giá trị thiết lập', required: true, placeholder: 'bat_tinh_nang_x' }
            ]
          }
        ]
      }
    ]
  };
