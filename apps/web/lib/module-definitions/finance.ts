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

export const financeModule: ModuleDefinition = {
    key: 'finance',
    title: 'Tài chính',
    summary: 'Quản trị tài chính kế toán: hóa đơn, tài khoản, bút toán, ngân sách.',
    highlights: ['Sổ kế toán lõi', 'Theo dõi công nợ', 'Giám sát ngân sách theo kỳ'],
    features: [
      {
        key: 'invoices',
        title: 'Hóa đơn',
        description: 'Quản lý hóa đơn đầu vào và đầu ra.',
        listEndpoint: '/finance/invoices',
        columns: ['id', 'invoiceNo', 'invoiceType', 'partnerName', 'totalAmount', 'dueAt', 'status'],
        actions: [
          {
            key: 'create-invoice',
            label: 'Tạo hóa đơn',
            method: 'POST',
            endpoint: '/finance/invoices',
            fields: [
              { name: 'invoiceNo', label: 'Số hóa đơn' },
              { name: 'invoiceType', label: 'Loại hóa đơn', required: true, placeholder: 'AR/AP' },
              { name: 'partnerName', label: 'Đối tác' },
              { name: 'totalAmount', label: 'Tổng tiền', type: 'number' },
              { name: 'dueAt', label: 'Hạn thanh toán', type: 'date' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'PENDING' }
            ]
          },
          {
            key: 'update-invoice',
            label: 'Cập nhật hóa đơn',
            method: 'PATCH',
            endpoint: '/finance/invoices/:id',
            fields: [
              { name: 'id', label: 'Mã hóa đơn', required: true },
              { name: 'partnerName', label: 'Đối tác' },
              { name: 'totalAmount', label: 'Tổng tiền', type: 'number' },
              { name: 'dueAt', label: 'Hạn', type: 'date' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          },
          {
            key: 'archive-invoice',
            label: 'Lưu trữ hóa đơn',
            method: 'DELETE',
            endpoint: '/finance/invoices/:id',
            fields: [{ name: 'id', label: 'Mã hóa đơn', required: true }]
          }
        ]
      },
      {
        key: 'accounts',
        title: 'Hệ thống tài khoản kế toán',
        description: 'Danh mục tài khoản kế toán chuẩn.',
        listEndpoint: '/finance/accounts',
        columns: ['id', 'accountCode', 'name', 'accountType', 'balance'],
        actions: [
          {
            key: 'create-account',
            label: 'Tạo tài khoản',
            method: 'POST',
            endpoint: '/finance/accounts',
            fields: [
              { name: 'accountCode', label: 'Mã TK', required: true },
              { name: 'name', label: 'Tên tài khoản', required: true },
              { name: 'accountType', label: 'Loại', required: true, placeholder: 'TAI_SAN/NO_PHAI_TRA/DOANH_THU/CHI_PHI' },
              { name: 'balance', label: 'Số dư', type: 'number' }
            ]
          },
          {
            key: 'update-account',
            label: 'Cập nhật tài khoản',
            method: 'PATCH',
            endpoint: '/finance/accounts/:id',
            fields: [
              { name: 'id', label: 'Mã tài khoản', required: true },
              { name: 'name', label: 'Tên mới' },
              { name: 'accountType', label: 'Loại' },
              { name: 'balance', label: 'Số dư', type: 'number' }
            ]
          }
        ]
      },
      {
        key: 'journal',
        title: 'Bút toán',
        description: 'Theo dõi bút toán và trạng thái ghi sổ.',
        listEndpoint: '/finance/journal-entries',
        columns: ['id', 'entryNo', 'entryDate', 'description', 'status'],
        actions: [
          {
            key: 'create-journal',
            label: 'Tạo bút toán',
            method: 'POST',
            endpoint: '/finance/journal-entries',
            fields: [
              { name: 'entryNo', label: 'Số bút toán' },
              { name: 'entryDate', label: 'Ngày hạch toán', type: 'date', required: true },
              { name: 'description', label: 'Diễn giải', type: 'textarea' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'DRAFT' }
            ]
          },
          {
            key: 'update-journal',
            label: 'Cập nhật bút toán',
            method: 'PATCH',
            endpoint: '/finance/journal-entries/:id',
            fields: [
              { name: 'id', label: 'Mã bút toán', required: true },
              { name: 'entryDate', label: 'Ngày', type: 'date' },
              { name: 'description', label: 'Diễn giải', type: 'textarea' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          }
        ]
      },
      {
        key: 'budget-plans',
        title: 'Kế hoạch ngân sách',
        description: 'Lập kế hoạch ngân sách theo danh mục và kỳ.',
        listEndpoint: '/finance/budget-plans',
        columns: ['id', 'category', 'fiscalPeriod', 'plannedAmount', 'actualAmount'],
        actions: [
          {
            key: 'create-budget-plan',
            label: 'Tạo kế hoạch',
            method: 'POST',
            endpoint: '/finance/budget-plans',
            fields: [
              { name: 'category', label: 'Danh mục', required: true },
              { name: 'fiscalPeriod', label: 'Kỳ tài chính', required: true, placeholder: '2026-Q1' },
              { name: 'plannedAmount', label: 'Kế hoạch', type: 'number' },
              { name: 'actualAmount', label: 'Thực tế', type: 'number' }
            ]
          },
          {
            key: 'update-budget-plan',
            label: 'Cập nhật kế hoạch',
            method: 'PATCH',
            endpoint: '/finance/budget-plans/:id',
            fields: [
              { name: 'id', label: 'Mã kế hoạch ngân sách', required: true },
              { name: 'plannedAmount', label: 'Kế hoạch', type: 'number' },
              { name: 'actualAmount', label: 'Thực tế', type: 'number' }
            ]
          }
        ]
      }
    ]
  };
