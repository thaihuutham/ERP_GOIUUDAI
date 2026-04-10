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

export const reportsModule: ModuleDefinition = {
    key: 'reports',
    title: 'Báo cáo',
    summary: 'Board báo cáo chuyên sâu: KPI điều hành, snapshot theo phân hệ và quản lý report definition.',
    highlights: ['KPI tổng quan', 'Snapshot theo phân hệ', 'Generate report hàng loạt'],
    features: [
      {
        key: 'overview',
        title: 'KPI tổng quan',
        description: 'Số liệu điều hành nhanh toàn hệ thống.',
        listEndpoint: '/reports/overview',
        view: 'object',
        actions: []
      },
      {
        key: 'module-snapshot',
        title: 'Dữ liệu theo phân hệ',
        description: 'Snapshot dữ liệu theo phân hệ với filter và phân trang server-side.',
        listEndpoint: '/reports/module',
        columns: ['id', 'status', 'createdAt'],
        filters: [
          {
            key: 'name',
            label: 'Phân hệ',
            type: 'select',
            queryParam: 'name',
            options: REPORT_MODULE_OPTIONS,
            defaultValue: 'sales'
          }
        ],
        actions: [
          {
            key: 'load-module-data',
            label: 'Tải dữ liệu phân hệ',
            method: 'GET',
            endpoint: '/reports/module?name=:name',
            fields: [
              {
                name: 'name',
                label: 'Tên phân hệ',
                type: 'select',
                required: true,
                options: REPORT_MODULE_OPTIONS,
                defaultValue: 'sales'
              }
            ]
          }
        ]
      },
      {
        key: 'report-definitions',
        title: 'Mẫu báo cáo',
        description: 'Danh sách và cấu hình các report definition có thể chạy tự động.',
        listEndpoint: '/reports',
        columns: ['id', 'name', 'reportType', 'moduleName', 'outputFormat', 'status', 'nextRunAt', 'lastRunAt'],
        filters: [
          {
            key: 'moduleName',
            label: 'Phân hệ',
            type: 'select',
            options: REPORT_MODULE_OPTIONS
          },
          {
            key: 'status',
            label: 'Trạng thái',
            type: 'select',
            options: STATUS_OPTIONS
          }
        ],
        actions: [
          {
            key: 'create-report-definition',
            label: 'Lưu mẫu báo cáo',
            method: 'POST',
            endpoint: '/reports',
            fields: [
              {
                name: 'reportType',
                label: 'Loại báo cáo',
                type: 'select',
                required: true,
                options: [
                  { label: 'Tổng hợp', value: 'TONG_HOP' },
                  { label: 'Vận hành', value: 'VAN_HANH' },
                  { label: 'Tài chính', value: 'TAI_CHINH' },
                  { label: 'Nhân sự', value: 'NHAN_SU' }
                ],
                defaultValue: 'TONG_HOP'
              },
              { name: 'name', label: 'Tên báo cáo', required: true },
              {
                name: 'moduleName',
                label: 'Phân hệ nguồn dữ liệu',
                type: 'select',
                options: REPORT_MODULE_OPTIONS,
                defaultValue: 'sales'
              },
              {
                name: 'templateCode',
                label: 'Template code',
                type: 'select',
                options: REPORT_GROUP_BY_OPTIONS,
                defaultValue: 'day'
              },
              {
                name: 'outputFormat',
                label: 'Định dạng đầu ra',
                type: 'select',
                options: REPORT_OUTPUT_FORMAT_OPTIONS,
                defaultValue: 'JSON'
              },
              {
                name: 'scheduleRule',
                label: 'Lịch chạy',
                type: 'select',
                options: REPORT_SCHEDULE_RULE_OPTIONS
              },
              { name: 'nextRunAt', label: 'Lần chạy tiếp theo', type: 'datetime-local' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'ACTIVE' }
            ]
          },
          {
            key: 'update-report-definition',
            label: 'Cập nhật mẫu báo cáo',
            method: 'PATCH',
            endpoint: '/reports/:id',
            fields: [
              { name: 'id', label: 'Mã mẫu báo cáo', required: true },
              {
                name: 'reportType',
                label: 'Loại báo cáo',
                type: 'select',
                options: [
                  { label: 'Tổng hợp', value: 'TONG_HOP' },
                  { label: 'Vận hành', value: 'VAN_HANH' },
                  { label: 'Tài chính', value: 'TAI_CHINH' },
                  { label: 'Nhân sự', value: 'NHAN_SU' }
                ]
              },
              { name: 'name', label: 'Tên báo cáo' },
              {
                name: 'moduleName',
                label: 'Phân hệ nguồn dữ liệu',
                type: 'select',
                options: REPORT_MODULE_OPTIONS
              },
              {
                name: 'templateCode',
                label: 'Template code',
                type: 'select',
                options: REPORT_GROUP_BY_OPTIONS
              },
              {
                name: 'outputFormat',
                label: 'Định dạng đầu ra',
                type: 'select',
                options: REPORT_OUTPUT_FORMAT_OPTIONS
              },
              {
                name: 'scheduleRule',
                label: 'Lịch chạy',
                type: 'select',
                options: REPORT_SCHEDULE_RULE_OPTIONS
              },
              { name: 'nextRunAt', label: 'Lần chạy tiếp theo', type: 'datetime-local' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          },
          {
            key: 'generate-report-now',
            label: 'Chạy báo cáo ngay',
            method: 'POST',
            endpoint: '/reports/:id/generate',
            fields: [
              { name: 'id', label: 'Mã mẫu báo cáo', required: true },
              {
                name: 'outputFormat',
                label: 'Định dạng đầu ra',
                type: 'select',
                options: REPORT_OUTPUT_FORMAT_OPTIONS,
                defaultValue: 'JSON'
              },
              { name: 'limit', label: 'Giới hạn bản ghi', type: 'number', defaultValue: 100 },
              {
                name: 'reason',
                label: 'Lý do chạy thủ công',
                type: 'select',
                required: true,
                options: [
                  { label: 'Yêu cầu vận hành', value: 'OPS_REQUEST' },
                  { label: 'Kiểm tra dữ liệu', value: 'DATA_VALIDATION' },
                  { label: 'Khẩn cấp', value: 'URGENT' }
                ],
                defaultValue: 'OPS_REQUEST'
              },
              { name: 'reference', label: 'Mã tham chiếu', required: true, placeholder: 'RPT-RUN-001' }
            ]
          }
        ]
      }
    ]
  };
