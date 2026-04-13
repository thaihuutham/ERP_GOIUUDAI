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

export const crmModule: ModuleDefinition = {
    key: 'crm',
    title: 'CRM',
    summary: 'Quản trị khách hàng tập trung: hồ sơ hợp nhất, tương tác và theo dõi thanh toán.',
    highlights: [
      'Hồ sơ khách hàng hợp nhất',
      'Phát hiện trùng tự động',
      'Theo dõi tương tác và thanh toán'
    ],
    features: [
      {
        key: 'customer-360',
        title: 'Khách hàng 360',
        description: 'Danh sách hồ sơ khách hàng hợp nhất.',
        listEndpoint: '/crm/customers',
        columns: [
          'id',
          'fullName',
          'phone',
          'email',
          'customerStage',
          'tags',
          'ownerStaffId',
          'totalOrders',
          'totalSpent',
          'lastContactAt',
          'status'
        ],
        actions: [
          {
            key: 'create-customer-360',
            label: 'Tạo khách hàng 360',
            method: 'POST',
            endpoint: '/crm/customers',
            fields: [
              { name: 'fullName', label: 'Họ tên', required: true, placeholder: 'Nguyễn Văn A' },
              { name: 'phone', label: 'Số điện thoại', placeholder: '0909123456' },
              { name: 'email', label: 'Email', placeholder: 'a@company.com' },
              {
                name: 'source',
                label: 'Nguồn khách hàng',
                type: 'select',
                options: []
              },
              { name: 'segment', label: 'Nhóm khách hàng', placeholder: 'VIP / Mới / Khách quay lại' },
              {
                name: 'customerStage',
                label: 'Giai đoạn khách hàng',
                type: 'select',
                options: []
              },
              { name: 'tags', label: 'Thẻ khách hàng', placeholder: 'Nhập theo customer tags trong Settings Center' },
              { name: 'ownerStaffId', label: 'Mã nhân viên phụ trách', placeholder: 'NV001' },
              {
                name: 'consentStatus',
                label: 'Trạng thái đồng ý nhận thông tin',
                type: 'select',
                options: [
                  { label: 'Đồng ý', value: 'DONG_Y' },
                  { label: 'Chưa xác nhận', value: 'CHUA_XAC_NHAN' },
                  { label: 'Từ chối', value: 'TU_CHOI' }
                ],
                defaultValue: 'CHUA_XAC_NHAN'
              },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'ACTIVE' }
            ]
          },
          {
            key: 'update-customer-360',
            label: 'Cập nhật khách hàng',
            method: 'PATCH',
            endpoint: '/crm/customers/:id',
            fields: [
              { name: 'id', label: 'Mã khách hàng', required: true, placeholder: 'cuid...' },
              { name: 'fullName', label: 'Họ tên mới' },
              { name: 'phone', label: 'SĐT mới' },
              { name: 'email', label: 'Email mới' },
              {
                name: 'source',
                label: 'Nguồn khách hàng',
                type: 'select',
                options: []
              },
              { name: 'segment', label: 'Nhóm khách hàng' },
              {
                name: 'customerStage',
                label: 'Giai đoạn khách hàng',
                type: 'select',
                options: []
              },
              { name: 'tags', label: 'Thẻ khách hàng', placeholder: 'Nhập theo customer tags trong Settings Center' },
              { name: 'ownerStaffId', label: 'Mã nhân viên phụ trách' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          },
          {
            key: 'archive-customer-360',
            label: 'Xóa khách hàng',
            method: 'DELETE',
            endpoint: '/crm/customers/:id',
            fields: [{ name: 'id', label: 'Mã khách hàng', required: true }]
          }
        ]
      },
      {
        key: 'interaction-desk',
        title: 'Nhật ký tương tác',
        description: 'Ghi nhận lịch sử tương tác và lịch chăm sóc tiếp theo.',
        listEndpoint: '/crm/interactions',
        columns: [
          'id',
          'customerId',
          'interactionType',
          'channel',
          'content',
          'resultTag',
          'staffName',
          'interactionAt',
          'nextActionAt'
        ],
        actions: [
          {
            key: 'create-customer-interaction',
            label: 'Ghi nhận tương tác',
            method: 'POST',
            endpoint: '/crm/interactions',
            fields: [
              { name: 'customerPhone', label: 'SĐT khách hàng', required: true, placeholder: '0909123456' },
              { name: 'customerEmail', label: 'Hoặc email khách hàng', placeholder: 'khachhang@email.com' },
              {
                name: 'interactionType',
                label: 'Loại tương tác',
                type: 'select',
                options: [
                  { label: 'Tư vấn', value: 'TU_VAN' },
                  { label: 'Chăm sóc sau bán', value: 'CHAM_SOC_SAU_BAN' },
                  { label: 'Nhắc thanh toán', value: 'NHAC_THANH_TOAN' },
                  { label: 'Tiếp nhận khiếu nại', value: 'KIEU_NAI' }
                ],
                defaultValue: 'TU_VAN'
              },
              {
                name: 'channel',
                label: 'Kênh tương tác',
                type: 'select',
                options: [
                  { label: 'Zalo', value: 'ZALO' },
                  { label: 'Điện thoại', value: 'CALL' },
                  { label: 'Email', value: 'EMAIL' },
                  { label: 'Tại cửa hàng', value: 'OFFLINE' }
                ],
                defaultValue: 'ZALO'
              },
              { name: 'content', label: 'Nội dung', type: 'textarea', required: true },
              {
                name: 'resultTag',
                label: 'Kết quả',
                placeholder: 'Nhập theo interactionResultTags trong Settings Center'
              },
              { name: 'staffName', label: 'Nhân viên phụ trách' },
              { name: 'nextActionAt', label: 'Lịch chăm sóc tiếp theo', type: 'datetime-local' }
            ]
          }
        ]
      },
      {
        key: 'payment-followup',
        title: 'Theo dõi gửi hóa đơn/QR',
        description: 'Gửi thông tin thanh toán và theo dõi trạng thái xử lý.',
        listEndpoint: '/crm/payment-requests',
        columns: ['id', 'customerId', 'invoiceNo', 'orderNo', 'channel', 'recipient', 'amount', 'status', 'sentAt', 'paidAt'],
        actions: [
          {
            key: 'create-payment-request',
            label: 'Tạo yêu cầu thanh toán',
            method: 'POST',
            endpoint: '/crm/payment-requests',
            fields: [
              { name: 'customerPhone', label: 'SĐT khách hàng', placeholder: '0909123456' },
              { name: 'customerEmail', label: 'Email khách hàng' },
              { name: 'invoiceNo', label: 'Mã hóa đơn', placeholder: 'INV-2026-001' },
              { name: 'orderNo', label: 'Mã đơn hàng', placeholder: 'SO-2026-001' },
              {
                name: 'channel',
                label: 'Kênh gửi',
                type: 'select',
                options: [
                  { label: 'Zalo', value: 'ZALO' },
                  { label: 'Email', value: 'EMAIL' }
                ],
                defaultValue: 'ZALO'
              },
              { name: 'recipient', label: 'Người nhận (SĐT/Email)' },
              { name: 'qrCodeUrl', label: 'Link mã QR thanh toán', placeholder: 'https://...' },
              { name: 'amount', label: 'Số tiền', type: 'number' },
              { name: 'note', label: 'Ghi chú', type: 'textarea' }
            ]
          },
          {
            key: 'mark-payment-request-paid',
            label: 'Đánh dấu đã thanh toán',
            method: 'POST',
            endpoint: '/crm/payment-requests/:id/mark-paid',
            allowedRoles: ['ADMIN'],
            fields: [
              { name: 'id', label: 'Mã yêu cầu thanh toán', required: true },
              { name: 'reason', label: 'Lý do override', required: true, placeholder: 'Webhook timeout fallback' },
              { name: 'reference', label: 'Mã tham chiếu', required: true, placeholder: 'MANUAL-REF-001' },
              { name: 'note', label: 'Ghi chú', type: 'textarea' }
            ]
          }
        ]
      },
      {
        key: 'dedup-center',
        title: 'Trung tâm gộp trùng lặp',
        description: 'Quản lý hồ sơ trùng và hợp nhất về khách hàng chính.',
        listEndpoint: '/crm/dedup-candidates',
        columns: ['dedupKey', 'rule', 'customers'],
        actions: [
          {
            key: 'merge-customers',
            label: 'Gộp hồ sơ khách hàng',
            method: 'POST',
            endpoint: '/crm/merge-customers',
            fields: [
              { name: 'primaryCustomerId', label: 'Mã khách hàng chính', required: true },
              { name: 'mergedCustomerId', label: 'Mã khách hàng cần gộp', required: true },
              { name: 'mergedBy', label: 'Người thực hiện' },
              { name: 'note', label: 'Ghi chú', type: 'textarea' }
            ]
          }
        ]
      }
    ]
  };
