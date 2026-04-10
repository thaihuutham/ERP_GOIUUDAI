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

export const salesModule: ModuleDefinition = {
    key: 'sales',
    title: 'Bán hàng',
    summary: 'Điều phối vòng đời đơn hàng và phê duyệt thay đổi giao dịch.',
    highlights: ['Tạo đơn nhanh', 'Tự động tạo yêu cầu duyệt', 'Phê duyệt trực tiếp'],
    features: [
      {
        key: 'orders',
        title: 'Bàn điều phối đơn hàng',
        description: 'Theo dõi và xử lý toàn bộ đơn hàng bán.',
        listEndpoint: '/sales/orders',
        columns: ['id', 'orderNo', 'customerName', 'totalAmount', 'status', 'createdBy', 'createdAt'],
        actions: [
          {
            key: 'create-order',
            label: 'Tạo đơn hàng',
            method: 'POST',
            endpoint: '/sales/orders',
            fields: [
              { name: 'orderNo', label: 'Mã đơn', placeholder: 'SO-2026-001' },
              { name: 'customerName', label: 'Tên khách hàng' },
              { name: 'createdBy', label: 'Người tạo', placeholder: 'user_01' },
              { name: 'productName', label: 'Tên sản phẩm', required: true, placeholder: 'Laptop Pro 14' },
              { name: 'quantity', label: 'Số lượng', type: 'number', required: true, defaultValue: 1 },
              { name: 'unitPrice', label: 'Đơn giá', type: 'number', required: true, placeholder: '15000000' }
            ]
          },
          {
            key: 'update-order',
            label: 'Cập nhật đơn hàng',
            method: 'PATCH',
            endpoint: '/sales/orders/:id',
            fields: [
              { name: 'id', label: 'Mã đơn hàng', required: true },
              { name: 'requesterId', label: 'Mã người yêu cầu', required: true, placeholder: 'user_01' },
              { name: 'requesterName', label: 'Tên người yêu cầu', required: true, placeholder: 'Nguyễn A' },
              { name: 'productName', label: 'Tên sản phẩm mới', required: true },
              { name: 'quantity', label: 'Số lượng mới', type: 'number', required: true, defaultValue: 1 },
              { name: 'unitPrice', label: 'Đơn giá mới', type: 'number', required: true }
            ]
          },
          {
            key: 'archive-order',
            label: 'Lưu trữ đơn hàng',
            method: 'DELETE',
            endpoint: '/sales/orders/:id',
            fields: [{ name: 'id', label: 'Mã đơn hàng', required: true }]
          }
        ]
      },
      {
        key: 'order-approvals',
        title: 'Hàng chờ phê duyệt',
        description: 'Danh sách yêu cầu chờ phê duyệt đơn hàng.',
        listEndpoint: '/sales/approvals',
        columns: ['id', 'targetId', 'requesterId', 'approverId', 'status', 'decidedAt', 'createdAt'],
        actions: [
          {
            key: 'approve-order-change',
            label: 'Duyệt yêu cầu',
            method: 'POST',
            endpoint: '/sales/approvals/:id/approve',
            fields: [{ name: 'id', label: 'Mã yêu cầu phê duyệt', required: true }]
          },
          {
            key: 'reject-order-change',
            label: 'Từ chối yêu cầu',
            method: 'POST',
            endpoint: '/sales/approvals/:id/reject',
            fields: [{ name: 'id', label: 'Mã yêu cầu phê duyệt', required: true }]
          }
        ]
      }
    ]
  };
