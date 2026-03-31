import type { ModuleDefinition } from './module-ui';

const STATUS_OPTIONS = [
  { label: 'Đang hoạt động', value: 'ACTIVE' },
  { label: 'Ngừng hoạt động', value: 'INACTIVE' },
  { label: 'Nháp', value: 'DRAFT' },
  { label: 'Chờ xử lý', value: 'PENDING' },
  { label: 'Đã duyệt', value: 'APPROVED' },
  { label: 'Từ chối', value: 'REJECTED' },
  { label: 'Lưu trữ', value: 'ARCHIVED' }
];

export const moduleDefinitions: Record<string, ModuleDefinition> = {
  crm: {
    key: 'crm',
    title: 'CRM',
    summary: 'Khách hàng 360 hợp nhất, lưu toàn bộ lịch sử tương tác và theo dõi gửi hóa đơn/QR thanh toán.',
    highlights: [
      'Một nguồn dữ liệu khách hàng duy nhất',
      'Chống trùng qua email và số điện thoại',
      'Theo dõi tương tác + thanh toán ngay trong CRM'
    ],
    features: [
      {
        key: 'customer-360',
        title: 'Khách hàng 360',
        description: 'Danh sách hồ sơ khách hàng hợp nhất và tự chống trùng.',
        listEndpoint: '/crm/customer-360',
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
            endpoint: '/crm/customer-360',
            fields: [
              { name: 'fullName', label: 'Họ tên', required: true, placeholder: 'Nguyễn Văn A' },
              { name: 'phone', label: 'Số điện thoại', placeholder: '0909123456' },
              { name: 'email', label: 'Email', placeholder: 'a@company.com' },
              { name: 'source', label: 'Nguồn khách hàng', placeholder: 'Zalo / Facebook / Cửa hàng' },
              { name: 'segment', label: 'Nhóm khách hàng', placeholder: 'VIP / Mới / Khách quay lại' },
              {
                name: 'customerStage',
                label: 'Giai đoạn khách hàng',
                type: 'select',
                options: [
                  { label: 'Mới', value: 'MOI' },
                  { label: 'Đã tư vấn', value: 'DA_TU_VAN' },
                  { label: 'Đang quan tâm', value: 'QUAN_TAM' },
                  { label: 'Đã mua', value: 'DA_MUA' },
                  { label: 'Không tiếp tục', value: 'KHONG_TIEP_TUC' }
                ],
                defaultValue: 'MOI'
              },
              { name: 'tags', label: 'Thẻ khách hàng', placeholder: 'vip, da_tu_van, uu_tien' },
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
            endpoint: '/crm/customer-360/:id',
            fields: [
              { name: 'id', label: 'Mã khách hàng', required: true, placeholder: 'cuid...' },
              { name: 'fullName', label: 'Họ tên mới' },
              { name: 'phone', label: 'SĐT mới' },
              { name: 'email', label: 'Email mới' },
              { name: 'source', label: 'Nguồn khách hàng' },
              { name: 'segment', label: 'Nhóm khách hàng' },
              {
                name: 'customerStage',
                label: 'Giai đoạn khách hàng',
                type: 'select',
                options: [
                  { label: 'Mới', value: 'MOI' },
                  { label: 'Đã tư vấn', value: 'DA_TU_VAN' },
                  { label: 'Đang quan tâm', value: 'QUAN_TAM' },
                  { label: 'Đã mua', value: 'DA_MUA' },
                  { label: 'Không tiếp tục', value: 'KHONG_TIEP_TUC' }
                ]
              },
              { name: 'tags', label: 'Thẻ khách hàng', placeholder: 'vip, da_mua, can_cham_soc' },
              { name: 'ownerStaffId', label: 'Mã nhân viên phụ trách' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          }
        ]
      },
      {
        key: 'interaction-desk',
        title: 'Nhật ký tương tác',
        description: 'Ghi nhận cuộc gọi, tin nhắn, ghi chú và lịch chăm sóc tiếp theo.',
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
                type: 'select',
                options: [
                  { label: 'Đang quan tâm', value: 'quan_tam' },
                  { label: 'Cần gọi lại', value: 'can_goi_lai' },
                  { label: 'Đã chốt đơn', value: 'da_chot' },
                  { label: 'Tạm dừng', value: 'tam_dung' }
                ]
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
        description: 'Gửi thông tin thanh toán qua Zalo/Email và theo dõi trạng thái thanh toán.',
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
            fields: [{ name: 'id', label: 'Mã yêu cầu thanh toán', required: true }]
          }
        ]
      },
      {
        key: 'dedup-center',
        title: 'Trung tâm gộp trùng lặp',
        description: 'Xem các hồ sơ trùng email/số điện thoại và gộp hồ sơ về một khách hàng chính.',
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
  },
  catalog: {
    key: 'catalog',
    title: 'Danh mục',
    summary: 'Danh mục sản phẩm/dịch vụ phục vụ bán hàng và quản trị tồn kho logic.',
    highlights: ['CRUD sản phẩm', 'Giá bán tiêu chuẩn', 'Khóa/mở sản phẩm theo trạng thái'],
    features: [
      {
        key: 'products',
        title: 'Danh mục sản phẩm',
        description: 'Danh sách sản phẩm với tạo/sửa/xóa đầy đủ.',
        listEndpoint: '/catalog/products',
        columns: ['id', 'sku', 'name', 'productType', 'unitPrice', 'status'],
        actions: [
          {
            key: 'create-product',
            label: 'Tạo sản phẩm',
            method: 'POST',
            endpoint: '/catalog/products',
            fields: [
              { name: 'sku', label: 'SKU', placeholder: 'SKU-001' },
              { name: 'name', label: 'Tên sản phẩm', required: true, placeholder: 'Laptop Pro' },
              {
                name: 'productType',
                label: 'Loại sản phẩm',
                type: 'select',
                required: true,
                options: [
                  { label: 'Hàng hóa', value: 'PRODUCT' },
                  { label: 'Dịch vụ', value: 'SERVICE' }
                ],
                defaultValue: 'PRODUCT'
              },
              { name: 'unitPrice', label: 'Đơn giá', type: 'number', required: true, placeholder: '15000000' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'ACTIVE' }
            ]
          },
          {
            key: 'update-product',
            label: 'Cập nhật sản phẩm',
            method: 'PATCH',
            endpoint: '/catalog/products/:id',
            fields: [
              { name: 'id', label: 'Mã sản phẩm', required: true },
              { name: 'sku', label: 'SKU mới' },
              { name: 'name', label: 'Tên mới' },
              {
                name: 'productType',
                label: 'Loại',
                type: 'select',
                options: [
                  { label: 'Hàng hóa', value: 'PRODUCT' },
                  { label: 'Dịch vụ', value: 'SERVICE' }
                ]
              },
              { name: 'unitPrice', label: 'Đơn giá', type: 'number' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          },
          {
            key: 'delete-product',
            label: 'Xóa sản phẩm',
            method: 'DELETE',
            endpoint: '/catalog/products/:id',
            fields: [{ name: 'id', label: 'Mã sản phẩm', required: true }]
          }
        ]
      }
    ]
  },
  sales: {
    key: 'sales',
    title: 'Bán hàng',
    summary: 'Quản lý đơn hàng và cơ chế phê duyệt chỉnh sửa theo chính sách tenant.',
    highlights: ['Tạo đơn hàng nhanh', 'Tự tạo yêu cầu duyệt khi thay đổi tổng tiền', 'Duyệt/Từ chối trực tiếp'],
    features: [
      {
        key: 'orders',
        title: 'Bàn điều phối đơn hàng',
        description: 'Theo dõi và thao tác đơn hàng.',
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
          }
        ]
      },
      {
        key: 'order-approvals',
        title: 'Hàng chờ phê duyệt',
        description: 'Danh sách yêu cầu chỉnh sửa đơn hàng chờ duyệt.',
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
  },
  hr: {
    key: 'hr',
    title: 'Nhân sự',
    summary: 'HRM hoàn chỉnh: cơ cấu tổ chức, hồ sơ nhân sự, chấm công, nghỉ phép, lương, tuyển dụng và phát triển năng lực.',
    highlights: ['Master data HR', 'Leave policy + leave balance', 'Payroll có line items'],
    features: [
      {
        key: 'employees',
        title: 'Hồ sơ nhân sự',
        description: 'Danh sách và cập nhật hồ sơ nhân viên.',
        listEndpoint: '/hr/employees',
        columns: ['id', 'code', 'fullName', 'department', 'position', 'joinDate', 'employmentType', 'baseSalary', 'status'],
        actions: [
          {
            key: 'create-employee',
            label: 'Tạo nhân viên',
            method: 'POST',
            endpoint: '/hr/employees',
            fields: [
              { name: 'code', label: 'Mã nhân viên' },
              { name: 'fullName', label: 'Họ tên', required: true },
              { name: 'email', label: 'Email' },
              { name: 'phone', label: 'Số điện thoại' },
              { name: 'department', label: 'Phòng ban' },
              { name: 'position', label: 'Chức danh' },
              { name: 'joinDate', label: 'Ngày vào làm', type: 'date' },
              {
                name: 'employmentType',
                label: 'Loại hình',
                type: 'select',
                options: [
                  { label: 'Toàn thời gian', value: 'FULL_TIME' },
                  { label: 'Bán thời gian', value: 'PART_TIME' },
                  { label: 'Hợp đồng', value: 'CONTRACT' },
                  { label: 'Thực tập', value: 'INTERN' }
                ],
                defaultValue: 'FULL_TIME'
              },
              { name: 'baseSalary', label: 'Lương cơ bản', type: 'number' },
              { name: 'workShiftId', label: 'Mã ca làm việc' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'ACTIVE' }
            ]
          },
          {
            key: 'update-employee',
            label: 'Cập nhật nhân viên',
            method: 'PATCH',
            endpoint: '/hr/employees/:id',
            fields: [
              { name: 'id', label: 'Mã nhân viên', required: true },
              { name: 'fullName', label: 'Họ tên mới' },
              { name: 'department', label: 'Phòng ban' },
              { name: 'position', label: 'Chức danh' },
              { name: 'joinDate', label: 'Ngày vào làm', type: 'date' },
              { name: 'baseSalary', label: 'Lương cơ bản', type: 'number' },
              { name: 'workShiftId', label: 'Mã ca làm việc' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          }
        ]
      },
      {
        key: 'departments',
        title: 'Cơ cấu phòng ban',
        description: 'Quản lý danh mục phòng ban.',
        listEndpoint: '/hr/departments',
        columns: ['id', 'code', 'name', 'managerEmployeeId', 'status'],
        actions: [
          {
            key: 'create-department',
            label: 'Tạo phòng ban',
            method: 'POST',
            endpoint: '/hr/departments',
            fields: [
              { name: 'code', label: 'Mã phòng ban' },
              { name: 'name', label: 'Tên phòng ban', required: true },
              { name: 'managerEmployeeId', label: 'Mã quản lý' },
              { name: 'description', label: 'Mô tả', type: 'textarea' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'ACTIVE' }
            ]
          },
          {
            key: 'update-department',
            label: 'Cập nhật phòng ban',
            method: 'PATCH',
            endpoint: '/hr/departments/:id',
            fields: [
              { name: 'id', label: 'Mã phòng ban', required: true },
              { name: 'name', label: 'Tên mới' },
              { name: 'managerEmployeeId', label: 'Mã quản lý' },
              { name: 'description', label: 'Mô tả', type: 'textarea' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          }
        ]
      },
      {
        key: 'positions',
        title: 'Danh mục chức danh',
        description: 'Quản lý chức danh theo phòng ban.',
        listEndpoint: '/hr/positions',
        columns: ['id', 'code', 'title', 'departmentId', 'level', 'status'],
        actions: [
          {
            key: 'create-position',
            label: 'Tạo chức danh',
            method: 'POST',
            endpoint: '/hr/positions',
            fields: [
              { name: 'code', label: 'Mã chức danh' },
              { name: 'title', label: 'Tên chức danh', required: true },
              { name: 'departmentId', label: 'Mã phòng ban' },
              { name: 'level', label: 'Cấp bậc' },
              { name: 'description', label: 'Mô tả', type: 'textarea' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'ACTIVE' }
            ]
          },
          {
            key: 'update-position',
            label: 'Cập nhật chức danh',
            method: 'PATCH',
            endpoint: '/hr/positions/:id',
            fields: [
              { name: 'id', label: 'Mã chức danh', required: true },
              { name: 'title', label: 'Tên mới' },
              { name: 'departmentId', label: 'Mã phòng ban' },
              { name: 'level', label: 'Cấp bậc' },
              { name: 'description', label: 'Mô tả', type: 'textarea' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          }
        ]
      },
      {
        key: 'work-shifts',
        title: 'Ca làm việc',
        description: 'Định nghĩa ca làm, giờ bắt đầu/kết thúc và quy tắc tăng ca.',
        listEndpoint: '/hr/work-shifts',
        columns: ['id', 'code', 'name', 'startTime', 'endTime', 'breakMinutes', 'overtimeThresholdMinutes', 'status'],
        actions: [
          {
            key: 'create-work-shift',
            label: 'Tạo ca làm việc',
            method: 'POST',
            endpoint: '/hr/work-shifts',
            fields: [
              { name: 'code', label: 'Mã ca' },
              { name: 'name', label: 'Tên ca', required: true },
              { name: 'startTime', label: 'Giờ bắt đầu (HH:mm)', required: true, placeholder: '08:30' },
              { name: 'endTime', label: 'Giờ kết thúc (HH:mm)', required: true, placeholder: '17:30' },
              { name: 'breakMinutes', label: 'Phút nghỉ', type: 'number', defaultValue: 60 },
              { name: 'overtimeThresholdMinutes', label: 'Ngưỡng OT (phút)', type: 'number', defaultValue: 30 },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'ACTIVE' }
            ]
          },
          {
            key: 'update-work-shift',
            label: 'Cập nhật ca làm',
            method: 'PATCH',
            endpoint: '/hr/work-shifts/:id',
            fields: [
              { name: 'id', label: 'Mã ca', required: true },
              { name: 'name', label: 'Tên ca' },
              { name: 'startTime', label: 'Giờ bắt đầu (HH:mm)', placeholder: '08:30' },
              { name: 'endTime', label: 'Giờ kết thúc (HH:mm)', placeholder: '17:30' },
              { name: 'breakMinutes', label: 'Phút nghỉ', type: 'number' },
              { name: 'overtimeThresholdMinutes', label: 'Ngưỡng OT (phút)', type: 'number' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          }
        ]
      },
      {
        key: 'leave-policies',
        title: 'Chính sách nghỉ phép',
        description: 'Quota nghỉ phép theo loại nghỉ và quy tắc duyệt.',
        listEndpoint: '/hr/leave-policies',
        columns: ['id', 'code', 'name', 'leaveType', 'isPaid', 'annualQuotaDays', 'maxConsecutiveDays', 'status'],
        actions: [
          {
            key: 'create-leave-policy',
            label: 'Tạo chính sách nghỉ',
            method: 'POST',
            endpoint: '/hr/leave-policies',
            fields: [
              { name: 'code', label: 'Mã policy' },
              { name: 'name', label: 'Tên policy', required: true },
              { name: 'leaveType', label: 'Loại nghỉ', required: true, placeholder: 'phep_nam/khong_luong/om_dau' },
              { name: 'isPaid', label: 'Nghỉ hưởng lương', type: 'checkbox', defaultValue: true },
              { name: 'annualQuotaDays', label: 'Số ngày nghỉ năm', type: 'number', defaultValue: 12 },
              { name: 'carryOverLimitDays', label: 'Tối đa chuyển năm', type: 'number', defaultValue: 0 },
              { name: 'maxConsecutiveDays', label: 'Tối đa nghỉ liên tiếp', type: 'number' },
              { name: 'requiresAttachment', label: 'Bắt buộc đính kèm', type: 'checkbox', defaultValue: false },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'ACTIVE' }
            ]
          },
          {
            key: 'update-leave-policy',
            label: 'Cập nhật chính sách',
            method: 'PATCH',
            endpoint: '/hr/leave-policies/:id',
            fields: [
              { name: 'id', label: 'Mã policy', required: true },
              { name: 'name', label: 'Tên policy' },
              { name: 'annualQuotaDays', label: 'Số ngày nghỉ năm', type: 'number' },
              { name: 'maxConsecutiveDays', label: 'Tối đa nghỉ liên tiếp', type: 'number' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          }
        ]
      },
      {
        key: 'contracts',
        title: 'Hợp đồng lao động',
        description: 'Lưu lịch sử hợp đồng nhân sự, mức lương và trạng thái hiệu lực.',
        listEndpoint: '/hr/contracts',
        columns: ['id', 'employeeId', 'contractNo', 'contractType', 'startDate', 'endDate', 'baseSalary', 'allowance', 'status'],
        actions: [
          {
            key: 'create-contract',
            label: 'Tạo hợp đồng',
            method: 'POST',
            endpoint: '/hr/contracts',
            fields: [
              { name: 'employeeId', label: 'Mã nhân viên', required: true },
              { name: 'contractNo', label: 'Số hợp đồng' },
              { name: 'contractType', label: 'Loại hợp đồng', required: true, placeholder: 'XAC_DINH_THOI_HAN/KHONG_XAC_DINH' },
              { name: 'startDate', label: 'Ngày bắt đầu', type: 'date', required: true },
              { name: 'endDate', label: 'Ngày kết thúc', type: 'date' },
              { name: 'baseSalary', label: 'Lương cơ bản', type: 'number' },
              { name: 'allowance', label: 'Phụ cấp', type: 'number' },
              { name: 'insuranceSalary', label: 'Mức đóng BH', type: 'number' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'ACTIVE' }
            ]
          },
          {
            key: 'update-contract',
            label: 'Cập nhật hợp đồng',
            method: 'PATCH',
            endpoint: '/hr/contracts/:id',
            fields: [
              { name: 'id', label: 'Mã hợp đồng', required: true },
              { name: 'endDate', label: 'Ngày kết thúc', type: 'date' },
              { name: 'baseSalary', label: 'Lương cơ bản', type: 'number' },
              { name: 'allowance', label: 'Phụ cấp', type: 'number' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          }
        ]
      },
      {
        key: 'payroll-components',
        title: 'Cấu phần lương',
        description: 'Danh mục khoản cộng/trừ để sinh bảng lương linh hoạt.',
        listEndpoint: '/hr/payroll-components',
        columns: ['id', 'code', 'name', 'componentType', 'formulaType', 'defaultValue', 'isTaxable', 'status'],
        actions: [
          {
            key: 'create-payroll-component',
            label: 'Tạo cấu phần lương',
            method: 'POST',
            endpoint: '/hr/payroll-components',
            fields: [
              { name: 'code', label: 'Mã cấu phần' },
              { name: 'name', label: 'Tên cấu phần', required: true },
              {
                name: 'componentType',
                label: 'Loại',
                type: 'select',
                options: [
                  { label: 'Khoản cộng', value: 'EARNING' },
                  { label: 'Khoản trừ', value: 'DEDUCTION' }
                ],
                defaultValue: 'EARNING'
              },
              {
                name: 'formulaType',
                label: 'Cách tính',
                type: 'select',
                options: [
                  { label: 'Giá trị cố định', value: 'FIXED' },
                  { label: '% lương cơ bản', value: 'PERCENT_BASE' }
                ],
                defaultValue: 'FIXED'
              },
              { name: 'defaultValue', label: 'Giá trị mặc định', type: 'number' },
              { name: 'isTaxable', label: 'Chịu thuế', type: 'checkbox', defaultValue: false },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'ACTIVE' }
            ]
          },
          {
            key: 'update-payroll-component',
            label: 'Cập nhật cấu phần',
            method: 'PATCH',
            endpoint: '/hr/payroll-components/:id',
            fields: [
              { name: 'id', label: 'Mã cấu phần', required: true },
              { name: 'name', label: 'Tên cấu phần' },
              { name: 'defaultValue', label: 'Giá trị mặc định', type: 'number' },
              { name: 'isTaxable', label: 'Chịu thuế', type: 'checkbox' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          }
        ]
      },
      {
        key: 'attendance',
        title: 'Bàn chấm công',
        description: 'Bảng chấm công và thao tác vào ca/ra ca.',
        listEndpoint: '/hr/attendance',
        columns: ['id', 'employeeId', 'workDate', 'workShiftId', 'checkInAt', 'checkOutAt', 'lateMinutes', 'overtimeMinutes', 'status'],
        actions: [
          {
            key: 'check-in',
            label: 'Chấm công vào',
            method: 'POST',
            endpoint: '/hr/attendance/check-in',
            fields: [
              { name: 'employeeId', label: 'Mã nhân viên', required: true },
              { name: 'workDate', label: 'Ngày làm việc', type: 'date' },
              { name: 'workShiftId', label: 'Mã ca làm việc' },
              { name: 'note', label: 'Ghi chú', type: 'textarea' }
            ]
          },
          {
            key: 'check-out',
            label: 'Chấm công ra',
            method: 'POST',
            endpoint: '/hr/attendance/check-out',
            fields: [
              { name: 'employeeId', label: 'Mã nhân viên', required: true },
              { name: 'workDate', label: 'Ngày làm việc', type: 'date' },
              { name: 'note', label: 'Ghi chú', type: 'textarea' }
            ]
          }
        ]
      },
      {
        key: 'leave-requests',
        title: 'Quản lý nghỉ phép',
        description: 'Quản lý đơn nghỉ phép, quota còn lại và phê duyệt.',
        listEndpoint: '/hr/leave-requests',
        columns: ['id', 'employeeId', 'leavePolicyId', 'leaveType', 'startDate', 'endDate', 'durationDays', 'status', 'approvedBy'],
        actions: [
          {
            key: 'create-leave',
            label: 'Tạo đơn nghỉ phép',
            method: 'POST',
            endpoint: '/hr/leave-requests',
            fields: [
              { name: 'employeeId', label: 'Mã nhân viên', required: true },
              { name: 'leavePolicyId', label: 'Mã chính sách nghỉ' },
              { name: 'leaveType', label: 'Loại nghỉ', placeholder: 'phep_nam/khong_luong/om_dau' },
              { name: 'startDate', label: 'Từ ngày', type: 'date', required: true },
              { name: 'endDate', label: 'Đến ngày', type: 'date', required: true },
              { name: 'reason', label: 'Lý do', type: 'textarea' },
              { name: 'attachmentUrl', label: 'Đường dẫn đính kèm' }
            ]
          },
          {
            key: 'get-leave-balance',
            label: 'Xem quota nghỉ còn lại',
            method: 'GET',
            endpoint: '/hr/employees/:id/leave-balance',
            fields: [
              { name: 'id', label: 'Mã nhân viên', required: true },
              { name: 'year', label: 'Năm', type: 'number', placeholder: '2026' }
            ]
          },
          {
            key: 'approve-leave',
            label: 'Duyệt đơn nghỉ',
            method: 'POST',
            endpoint: '/hr/leave-requests/:id/approve',
            fields: [
              { name: 'id', label: 'Mã đơn nghỉ', required: true },
              { name: 'approverId', label: 'Mã người duyệt' }
            ]
          },
          {
            key: 'reject-leave',
            label: 'Từ chối đơn nghỉ',
            method: 'POST',
            endpoint: '/hr/leave-requests/:id/reject',
            fields: [
              { name: 'id', label: 'Mã đơn nghỉ', required: true },
              { name: 'approverId', label: 'Mã người duyệt' }
            ]
          }
        ]
      },
      {
        key: 'payroll',
        title: 'Xử lý bảng lương',
        description: 'Sinh bảng lương tháng và xem line item chi tiết.',
        listEndpoint: '/hr/payrolls',
        columns: ['id', 'employeeId', 'payMonth', 'payYear', 'workingDays', 'overtimeHours', 'grossSalary', 'deduction', 'netSalary', 'status', 'paidAt'],
        actions: [
          {
            key: 'generate-payroll',
            label: 'Tạo bảng lương',
            method: 'POST',
            endpoint: '/hr/payrolls/generate',
            fields: [
              { name: 'month', label: 'Tháng', type: 'number', required: true, placeholder: '3' },
              { name: 'year', label: 'Năm', type: 'number', required: true, placeholder: '2026' },
              { name: 'employeeId', label: 'Mã nhân viên (tùy chọn)' },
              { name: 'note', label: 'Ghi chú', type: 'textarea' }
            ]
          },
          {
            key: 'get-payroll-lines',
            label: 'Xem line item bảng lương',
            method: 'GET',
            endpoint: '/hr/payrolls/:id/lines',
            fields: [{ name: 'id', label: 'Mã bảng lương', required: true }]
          },
          {
            key: 'pay-payroll',
            label: 'Đánh dấu đã trả lương',
            method: 'POST',
            endpoint: '/hr/payrolls/:id/pay',
            fields: [{ name: 'id', label: 'Mã bảng lương', required: true }]
          }
        ]
      },
      {
        key: 'recruitment',
        title: 'Tuyến tuyển dụng',
        description: 'Theo dõi ứng viên và trạng thái tuyển dụng.',
        listEndpoint: '/hr/recruitment',
        columns: ['id', 'jobTitle', 'candidateName', 'stage', 'status', 'createdAt'],
        actions: [
          {
            key: 'create-recruitment',
            label: 'Thêm hồ sơ tuyển dụng',
            method: 'POST',
            endpoint: '/hr/recruitment',
            fields: [
              { name: 'jobTitle', label: 'Vị trí', required: true },
              { name: 'candidateName', label: 'Ứng viên' },
              { name: 'stage', label: 'Giai đoạn' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'PENDING' }
            ]
          },
          {
            key: 'update-recruitment',
            label: 'Cập nhật tuyển dụng',
            method: 'PATCH',
            endpoint: '/hr/recruitment/:id',
            fields: [
              { name: 'id', label: 'Mã hồ sơ tuyển dụng', required: true },
              { name: 'jobTitle', label: 'Vị trí' },
              { name: 'candidateName', label: 'Ứng viên' },
              { name: 'stage', label: 'Giai đoạn' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          }
        ]
      },
      {
        key: 'training',
        title: 'Theo dõi đào tạo',
        description: 'Khóa đào tạo và mức độ hoàn thành.',
        listEndpoint: '/hr/training',
        columns: ['id', 'title', 'employeeId', 'completedAt', 'status'],
        actions: [
          {
            key: 'create-training',
            label: 'Tạo chương trình đào tạo',
            method: 'POST',
            endpoint: '/hr/training',
            fields: [
              { name: 'title', label: 'Tên khóa học', required: true },
              { name: 'employeeId', label: 'Mã nhân viên' },
              { name: 'completedAt', label: 'Ngày hoàn thành', type: 'date' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'PENDING' }
            ]
          },
          {
            key: 'update-training',
            label: 'Cập nhật đào tạo',
            method: 'PATCH',
            endpoint: '/hr/training/:id',
            fields: [
              { name: 'id', label: 'Mã đào tạo', required: true },
              { name: 'title', label: 'Tên khóa học' },
              { name: 'employeeId', label: 'Mã nhân viên' },
              { name: 'completedAt', label: 'Ngày hoàn thành', type: 'date' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          }
        ]
      },
      {
        key: 'performance',
        title: 'Đánh giá hiệu suất',
        description: 'Đánh giá hiệu suất nhân sự theo kỳ.',
        listEndpoint: '/hr/performance',
        columns: ['id', 'employeeId', 'period', 'score', 'reviewerId', 'note'],
        actions: [
          {
            key: 'create-performance',
            label: 'Thêm đánh giá',
            method: 'POST',
            endpoint: '/hr/performance',
            fields: [
              { name: 'employeeId', label: 'Mã nhân viên', required: true },
              { name: 'period', label: 'Kỳ đánh giá', required: true, placeholder: 'Q1-2026' },
              { name: 'score', label: 'Điểm', type: 'number' },
              { name: 'reviewerId', label: 'Mã người đánh giá' },
              { name: 'note', label: 'Nhận xét', type: 'textarea' }
            ]
          },
          {
            key: 'update-performance',
            label: 'Cập nhật đánh giá',
            method: 'PATCH',
            endpoint: '/hr/performance/:id',
            fields: [
              { name: 'id', label: 'Mã đánh giá', required: true },
              { name: 'period', label: 'Kỳ đánh giá' },
              { name: 'score', label: 'Điểm', type: 'number' },
              { name: 'reviewerId', label: 'Mã người đánh giá' },
              { name: 'note', label: 'Nhận xét', type: 'textarea' }
            ]
          }
        ]
      },
      {
        key: 'benefits',
        title: 'Quản lý phúc lợi',
        description: 'Theo dõi phúc lợi và chi phí phúc lợi.',
        listEndpoint: '/hr/benefits',
        columns: ['id', 'employeeId', 'benefitType', 'amount', 'status'],
        actions: [
          {
            key: 'create-benefit',
            label: 'Thêm phúc lợi',
            method: 'POST',
            endpoint: '/hr/benefits',
            fields: [
              { name: 'employeeId', label: 'Mã nhân viên', required: true },
              { name: 'benefitType', label: 'Loại phúc lợi', required: true },
              { name: 'amount', label: 'Giá trị', type: 'number' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'ACTIVE' }
            ]
          },
          {
            key: 'update-benefit',
            label: 'Cập nhật phúc lợi',
            method: 'PATCH',
            endpoint: '/hr/benefits/:id',
            fields: [
              { name: 'id', label: 'Mã phúc lợi', required: true },
              { name: 'benefitType', label: 'Loại phúc lợi' },
              { name: 'amount', label: 'Giá trị', type: 'number' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          }
        ]
      },
      {
        key: 'personal-income-tax',
        title: 'Thuế TNCN',
        description: 'Quản lý hồ sơ và bản ghi thuế TNCN theo kỳ tháng/năm.',
        listEndpoint: '/hr/personal-income-tax/records',
        columns: [
          'id',
          'employeeCode',
          'employeeName',
          'taxMonth',
          'taxYear',
          'grossTaxable',
          'deduction',
          'taxableIncome',
          'taxRate',
          'taxAmount',
          'status',
          'lockedAt'
        ],
        filters: [
          { key: 'month', label: 'Tháng', type: 'number', placeholder: 'Tháng', queryParam: 'month' },
          { key: 'year', label: 'Năm', type: 'number', placeholder: 'Năm', queryParam: 'year' },
          { key: 'employeeId', label: 'Mã nhân viên', type: 'text', placeholder: 'EMP-0001', queryParam: 'employeeId' }
        ],
        actions: [
          {
            key: 'generate-personal-income-tax-records',
            label: 'Generate kỳ thuế',
            method: 'POST',
            endpoint: '/hr/personal-income-tax/records/generate',
            fields: [
              { name: 'taxMonth', label: 'Tháng', type: 'number', required: true, defaultValue: 3 },
              { name: 'taxYear', label: 'Năm', type: 'number', required: true, defaultValue: 2026 },
              { name: 'employeeId', label: 'Mã nhân viên (tùy chọn)' },
              { name: 'taxRate', label: 'Thuế suất override', type: 'number', placeholder: '0.1' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'DRAFT' }
            ]
          },
          {
            key: 'create-personal-income-tax-profile',
            label: 'Tạo hồ sơ thuế',
            method: 'POST',
            endpoint: '/hr/personal-income-tax/profiles',
            fields: [
              { name: 'employeeId', label: 'Mã nhân viên', required: true },
              { name: 'taxCode', label: 'Mã số thuế' },
              { name: 'personalDeduction', label: 'Giảm trừ bản thân', type: 'number', defaultValue: 11000000 },
              { name: 'dependentCount', label: 'Số người phụ thuộc', type: 'number', defaultValue: 0 },
              { name: 'dependentDeduction', label: 'Giảm trừ người phụ thuộc', type: 'number', defaultValue: 4400000 },
              { name: 'insuranceDeduction', label: 'Giảm trừ bảo hiểm', type: 'number', defaultValue: 0 },
              { name: 'otherDeduction', label: 'Giảm trừ khác', type: 'number', defaultValue: 0 },
              { name: 'taxRate', label: 'Thuế suất', type: 'number', defaultValue: 0.1 },
              { name: 'note', label: 'Ghi chú', type: 'textarea' }
            ]
          },
          {
            key: 'create-personal-income-tax-record',
            label: 'Tạo bản ghi thuế',
            method: 'POST',
            endpoint: '/hr/personal-income-tax/records',
            fields: [
              { name: 'employeeId', label: 'Mã nhân viên', required: true },
              { name: 'payrollId', label: 'Mã bảng lương (tùy chọn)' },
              { name: 'taxMonth', label: 'Tháng', type: 'number', required: true },
              { name: 'taxYear', label: 'Năm', type: 'number', required: true },
              { name: 'grossTaxable', label: 'Thu nhập chịu thuế', type: 'number' },
              { name: 'deduction', label: 'Tổng giảm trừ', type: 'number' },
              { name: 'taxableIncome', label: 'Thu nhập tính thuế', type: 'number' },
              { name: 'taxRate', label: 'Thuế suất', type: 'number', defaultValue: 0.1 },
              { name: 'taxAmount', label: 'Tiền thuế', type: 'number' },
              { name: 'note', label: 'Ghi chú', type: 'textarea' }
            ]
          },
          {
            key: 'update-personal-income-tax-record',
            label: 'Cập nhật bản ghi thuế',
            method: 'PATCH',
            endpoint: '/hr/personal-income-tax/records/:id',
            fields: [
              { name: 'id', label: 'Mã bản ghi', required: true },
              { name: 'employeeId', label: 'Mã nhân viên' },
              { name: 'payrollId', label: 'Mã bảng lương' },
              { name: 'taxMonth', label: 'Tháng', type: 'number' },
              { name: 'taxYear', label: 'Năm', type: 'number' },
              { name: 'grossTaxable', label: 'Thu nhập chịu thuế', type: 'number' },
              { name: 'deduction', label: 'Tổng giảm trừ', type: 'number' },
              { name: 'taxableIncome', label: 'Thu nhập tính thuế', type: 'number' },
              { name: 'taxRate', label: 'Thuế suất', type: 'number' },
              { name: 'taxAmount', label: 'Tiền thuế', type: 'number' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS },
              { name: 'note', label: 'Ghi chú', type: 'textarea' }
            ]
          }
        ]
      },
      {
        key: 'goals',
        title: 'Mục tiêu nhân sự',
        description: 'Thiết lập mục tiêu theo nhân viên/kỳ và theo dõi tiến độ thực hiện.',
        listEndpoint: '/hr/goals',
        columns: [
          'id',
          'goalCode',
          'title',
          'employeeCode',
          'employeeName',
          'period',
          'targetValue',
          'currentValue',
          'progressPercent',
          'status',
          'endDate'
        ],
        filters: [
          { key: 'employeeId', label: 'Mã nhân viên', type: 'text', placeholder: 'EMP-0001', queryParam: 'employeeId' },
          { key: 'period', label: 'Kỳ', type: 'text', placeholder: 'Q1-2026', queryParam: 'period' },
          { key: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, queryParam: 'status' }
        ],
        actions: [
          {
            key: 'create-goal',
            label: 'Tạo mục tiêu',
            method: 'POST',
            endpoint: '/hr/goals',
            fields: [
              { name: 'employeeId', label: 'Mã nhân viên', required: true },
              { name: 'goalCode', label: 'Mã mục tiêu' },
              { name: 'title', label: 'Tên mục tiêu', required: true },
              { name: 'description', label: 'Mô tả', type: 'textarea' },
              { name: 'period', label: 'Kỳ', required: true, placeholder: 'Q1-2026' },
              { name: 'targetValue', label: 'Giá trị mục tiêu', type: 'number' },
              { name: 'currentValue', label: 'Giá trị hiện tại', type: 'number', defaultValue: 0 },
              { name: 'weight', label: 'Trọng số', type: 'number', defaultValue: 1 },
              { name: 'startDate', label: 'Ngày bắt đầu', type: 'date' },
              { name: 'endDate', label: 'Ngày kết thúc', type: 'date' },
              { name: 'note', label: 'Ghi chú', type: 'textarea' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'PENDING' }
            ]
          },
          {
            key: 'update-goal',
            label: 'Cập nhật mục tiêu',
            method: 'PATCH',
            endpoint: '/hr/goals/:id',
            fields: [
              { name: 'id', label: 'Mã mục tiêu', required: true },
              { name: 'title', label: 'Tên mục tiêu' },
              { name: 'description', label: 'Mô tả', type: 'textarea' },
              { name: 'period', label: 'Kỳ' },
              { name: 'targetValue', label: 'Giá trị mục tiêu', type: 'number' },
              { name: 'currentValue', label: 'Giá trị hiện tại', type: 'number' },
              { name: 'weight', label: 'Trọng số', type: 'number' },
              { name: 'startDate', label: 'Ngày bắt đầu', type: 'date' },
              { name: 'endDate', label: 'Ngày kết thúc', type: 'date' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS },
              { name: 'note', label: 'Ghi chú', type: 'textarea' }
            ]
          },
          {
            key: 'update-goal-progress',
            label: 'Cập nhật tiến độ',
            method: 'PATCH',
            endpoint: '/hr/goals/:id/progress',
            fields: [
              { name: 'id', label: 'Mã mục tiêu', required: true },
              { name: 'currentValue', label: 'Giá trị hiện tại', type: 'number', required: true },
              { name: 'progressPercent', label: 'Tiến độ (%)', type: 'number' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS },
              { name: 'note', label: 'Ghi chú', type: 'textarea' }
            ]
          }
        ]
      },
      {
        key: 'employee-info',
        title: 'Thông tin nhân sự',
        description: 'Danh sách hồ sơ nhân sự tổng hợp và cập nhật thông tin chi tiết.',
        listEndpoint: '/hr/employee-info',
        columns: [
          'id',
          'code',
          'fullName',
          'department',
          'position',
          'employmentType',
          'status',
          'benefitCount',
          'joinDate'
        ],
        actions: [
          {
            key: 'get-employee-info-detail',
            label: 'Xem hồ sơ chi tiết',
            method: 'GET',
            endpoint: '/hr/employee-info/:id',
            fields: [{ name: 'id', label: 'Mã nhân viên', required: true }]
          },
          {
            key: 'update-employee-info',
            label: 'Cập nhật thông tin nhân sự',
            method: 'PATCH',
            endpoint: '/hr/employee-info/:id',
            fields: [
              { name: 'id', label: 'Mã nhân viên', required: true },
              { name: 'code', label: 'Mã nhân viên mới' },
              { name: 'fullName', label: 'Họ tên' },
              { name: 'email', label: 'Email' },
              { name: 'phone', label: 'Số điện thoại' },
              { name: 'department', label: 'Phòng ban' },
              { name: 'position', label: 'Chức danh' },
              { name: 'joinDate', label: 'Ngày vào làm', type: 'date' },
              { name: 'baseSalary', label: 'Lương cơ bản', type: 'number' },
              { name: 'taxCode', label: 'Mã số thuế' },
              { name: 'bankName', label: 'Ngân hàng' },
              { name: 'bankAccountNo', label: 'Số tài khoản' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          }
        ]
      },
      {
        key: 'hr-events',
        title: 'Lịch sử vòng đời nhân sự',
        description: 'Theo dõi sự kiện HR (onboard, đổi vị trí, nghỉ việc, duyệt phép...).',
        listEndpoint: '/hr/events',
        columns: ['id', 'employeeId', 'eventType', 'effectiveAt', 'createdBy', 'createdAt'],
        actions: [
          {
            key: 'create-hr-event',
            label: 'Thêm sự kiện HR',
            method: 'POST',
            endpoint: '/hr/employees/:id/events',
            fields: [
              { name: 'id', label: 'Mã nhân viên', required: true },
              { name: 'eventType', label: 'Loại sự kiện', required: true, placeholder: 'ONBOARD/PROMOTION/TRANSFER/OFFBOARD' },
              { name: 'effectiveAt', label: 'Ngày hiệu lực', type: 'date' },
              { name: 'createdBy', label: 'Người tạo' },
              { name: 'payload', label: 'Payload (JSON)', type: 'json', placeholder: '{\"from\":\"Kinh doanh\",\"to\":\"Marketing\"}' }
            ]
          }
        ]
      }
    ]
  },
  finance: {
    key: 'finance',
    title: 'Tài chính',
    summary: 'Khối tài chính kế toán: hóa đơn, tài khoản, bút toán, ngân sách.',
    highlights: ['Bộ sổ kế toán lõi', 'Theo dõi công nợ', 'Giám sát ngân sách theo kỳ'],
    features: [
      {
        key: 'invoices',
        title: 'Hóa đơn',
        description: 'Quản lý hóa đơn mua/bán.',
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
          }
        ]
      },
      {
        key: 'accounts',
        title: 'Hệ thống tài khoản kế toán',
        description: 'Danh mục tài khoản kế toán.',
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
        description: 'Bút toán và trạng thái ghi sổ.',
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
        description: 'Lập kế hoạch ngân sách theo danh mục và kỳ tài chính.',
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
  },
  scm: {
    key: 'scm',
    title: 'Chuỗi cung ứng',
    summary: 'Vận hành chuỗi cung ứng từ nhà cung cấp đến vận chuyển, phân phối và dự báo nhu cầu.',
    highlights: ['Vendor & PO', 'Shipment/Distribution', 'Demand forecast + risk control'],
    features: [
      {
        key: 'vendors',
        title: 'Danh mục nhà cung cấp',
        description: 'Quản lý nhà cung cấp.',
        listEndpoint: '/scm/vendors',
        columns: ['id', 'code', 'name', 'phone', 'email', 'status'],
        actions: [
          {
            key: 'create-vendor',
            label: 'Tạo nhà cung cấp',
            method: 'POST',
            endpoint: '/scm/vendors',
            fields: [
              { name: 'code', label: 'Mã nhà cung cấp' },
              { name: 'name', label: 'Tên nhà cung cấp', required: true },
              { name: 'phone', label: 'SĐT' },
              { name: 'email', label: 'Email' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'ACTIVE' }
            ]
          },
          {
            key: 'update-vendor',
            label: 'Cập nhật nhà cung cấp',
            method: 'PATCH',
            endpoint: '/scm/vendors/:id',
            fields: [
              { name: 'id', label: 'Mã nhà cung cấp', required: true },
              { name: 'name', label: 'Tên mới' },
              { name: 'phone', label: 'SĐT mới' },
              { name: 'email', label: 'Email mới' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          }
        ]
      },
      {
        key: 'purchase-orders',
        title: 'Đơn mua hàng',
        description: 'Theo dõi đơn mua hàng.',
        listEndpoint: '/scm/purchase-orders',
        columns: ['id', 'poNo', 'vendorId', 'totalAmount', 'status'],
        actions: [
          {
            key: 'create-po',
            label: 'Tạo PO',
            method: 'POST',
            endpoint: '/scm/purchase-orders',
            fields: [
              { name: 'poNo', label: 'Mã PO' },
              { name: 'vendorId', label: 'Mã nhà cung cấp' },
              { name: 'totalAmount', label: 'Tổng tiền', type: 'number' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'PENDING' }
            ]
          },
          {
            key: 'update-po',
            label: 'Cập nhật PO',
            method: 'PATCH',
            endpoint: '/scm/purchase-orders/:id',
            fields: [
              { name: 'id', label: 'Mã PO', required: true },
              { name: 'totalAmount', label: 'Tổng tiền', type: 'number' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          }
        ]
      },
      {
        key: 'shipments',
        title: 'Theo dõi vận chuyển',
        description: 'Theo dõi vận đơn và thời gian giao nhận.',
        listEndpoint: '/scm/shipments',
        columns: ['id', 'shipmentNo', 'orderRef', 'carrier', 'status', 'shippedAt', 'deliveredAt'],
        actions: [
          {
            key: 'create-shipment',
            label: 'Tạo vận chuyển',
            method: 'POST',
            endpoint: '/scm/shipments',
            fields: [
              { name: 'shipmentNo', label: 'Mã vận chuyển' },
              { name: 'orderRef', label: 'Mã đơn tham chiếu' },
              { name: 'carrier', label: 'Đơn vị vận chuyển' },
              { name: 'shippedAt', label: 'Ngày gửi', type: 'date' },
              { name: 'deliveredAt', label: 'Ngày nhận', type: 'date' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'PENDING' }
            ]
          },
          {
            key: 'update-shipment',
            label: 'Cập nhật vận chuyển',
            method: 'PATCH',
            endpoint: '/scm/shipments/:id',
            fields: [
              { name: 'id', label: 'Mã vận chuyển', required: true },
              { name: 'carrier', label: 'Đơn vị vận chuyển' },
              { name: 'deliveredAt', label: 'Ngày nhận', type: 'date' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          }
        ]
      },
      {
        key: 'distributions',
        title: 'Điều phối phân phối',
        description: 'Quản lý lệnh phân phối.',
        listEndpoint: '/scm/distributions',
        columns: ['id', 'distributionNo', 'destination', 'status'],
        actions: [
          {
            key: 'create-distribution',
            label: 'Tạo lệnh phân phối',
            method: 'POST',
            endpoint: '/scm/distributions',
            fields: [
              { name: 'distributionNo', label: 'Mã phân phối' },
              { name: 'destination', label: 'Điểm đến' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'PENDING' }
            ]
          },
          {
            key: 'update-distribution',
            label: 'Cập nhật phân phối',
            method: 'PATCH',
            endpoint: '/scm/distributions/:id',
            fields: [
              { name: 'id', label: 'Mã phân phối', required: true },
              { name: 'destination', label: 'Điểm đến' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          }
        ]
      },
      {
        key: 'demand-forecasts',
        title: 'Dự báo nhu cầu',
        description: 'Dự báo nhu cầu theo SKU/kỳ.',
        listEndpoint: '/scm/demand-forecasts',
        columns: ['id', 'sku', 'period', 'predictedQty', 'confidence'],
        actions: [
          {
            key: 'create-forecast',
            label: 'Tạo dự báo',
            method: 'POST',
            endpoint: '/scm/demand-forecasts',
            fields: [
              { name: 'sku', label: 'SKU' },
              { name: 'period', label: 'Kỳ dự báo', required: true, placeholder: '2026-04' },
              { name: 'predictedQty', label: 'Số lượng dự báo', type: 'number' },
              { name: 'confidence', label: 'Độ tin cậy (0-1)', type: 'number' }
            ]
          },
          {
            key: 'update-forecast',
            label: 'Cập nhật dự báo',
            method: 'PATCH',
            endpoint: '/scm/demand-forecasts/:id',
            fields: [
              { name: 'id', label: 'Mã dự báo', required: true },
              { name: 'predictedQty', label: 'Số lượng', type: 'number' },
              { name: 'confidence', label: 'Độ tin cậy', type: 'number' }
            ]
          }
        ]
      },
      {
        key: 'supply-chain-risks',
        title: 'Sổ rủi ro',
        description: 'Ghi nhận và xử lý rủi ro chuỗi cung ứng.',
        listEndpoint: '/scm/supply-chain-risks',
        columns: ['id', 'title', 'severity', 'mitigation', 'status'],
        actions: [
          {
            key: 'create-risk',
            label: 'Tạo rủi ro',
            method: 'POST',
            endpoint: '/scm/supply-chain-risks',
            fields: [
              { name: 'title', label: 'Tiêu đề', required: true },
              { name: 'severity', label: 'Mức độ', required: true, placeholder: 'thap/vua/cao' },
              { name: 'mitigation', label: 'Phương án', type: 'textarea' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'PENDING' }
            ]
          },
          {
            key: 'update-risk',
            label: 'Cập nhật rủi ro',
            method: 'PATCH',
            endpoint: '/scm/supply-chain-risks/:id',
            fields: [
              { name: 'id', label: 'Mã rủi ro', required: true },
              { name: 'severity', label: 'Mức độ' },
              { name: 'mitigation', label: 'Phương án', type: 'textarea' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          }
        ]
      }
    ]
  },
  assets: {
    key: 'assets',
    title: 'Tài sản',
    summary: 'Quản lý tài sản, cấp phát cho nhân sự và thu hồi theo vòng đời.',
    highlights: ['Kho tài sản', 'Cấp phát/thu hồi', 'Lịch sử cấp phát'],
    features: [
      {
        key: 'asset-inventory',
        title: 'Kho tài sản',
        description: 'Danh sách tài sản và thông tin giá trị.',
        listEndpoint: '/assets',
        columns: ['id', 'assetCode', 'name', 'category', 'value', 'status', 'purchaseAt'],
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
              { name: 'value', label: 'Giá trị', type: 'number' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          },
          {
            key: 'allocate-asset',
            label: 'Cấp phát tài sản',
            method: 'POST',
            endpoint: '/assets/:id/allocate',
            fields: [
              { name: 'id', label: 'Mã tài sản', required: true },
              { name: 'employeeId', label: 'Mã nhân viên', required: true }
            ]
          },
          {
            key: 'return-asset',
            label: 'Thu hồi tài sản',
            method: 'POST',
            endpoint: '/assets/:id/return',
            fields: [
              { name: 'id', label: 'Mã tài sản', required: true },
              { name: 'notes', label: 'Ghi chú', type: 'textarea' }
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
        actions: []
      }
    ]
  },
  projects: {
    key: 'projects',
    title: 'Dự án',
    summary: 'Điều phối dự án, công việc, nguồn lực, ngân sách và bảng công.',
    highlights: ['Danh mục dự án', 'Luồng trạng thái công việc', 'Ngân sách và bản ghi công'],
    features: [
      {
        key: 'project-list',
        title: 'Danh mục dự án',
        description: 'Tạo và cập nhật dự án.',
        listEndpoint: '/projects',
        columns: ['id', 'code', 'name', 'status', 'startAt', 'endAt'],
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
              { name: 'startDate', label: 'Bắt đầu', type: 'date' },
              { name: 'endDate', label: 'Kết thúc', type: 'date' },
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
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          }
        ]
      },
      {
        key: 'project-tasks',
        title: 'Bảng công việc',
        description: 'Quản lý công việc theo dự án.',
        listEndpoint: '/projects/tasks',
        columns: ['id', 'projectId', 'title', 'assignedTo', 'status', 'dueAt'],
        actions: [
          {
            key: 'create-task',
            label: 'Tạo công việc',
            method: 'POST',
            endpoint: '/projects/tasks',
            fields: [
              { name: 'projectId', label: 'Mã dự án', required: true },
              { name: 'title', label: 'Tiêu đề công việc', required: true },
              { name: 'assignedTo', label: 'Mã người phụ trách' },
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
        actions: [
          {
            key: 'create-resource',
            label: 'Thêm nguồn lực',
            method: 'POST',
            endpoint: '/projects/resources',
            fields: [
              { name: 'projectId', label: 'Mã dự án', required: true },
              { name: 'resourceType', label: 'Loại nguồn lực', required: true, placeholder: 'nhan_vien/thiet_bi' },
              { name: 'resourceRef', label: 'Mã tham chiếu nguồn lực' },
              { name: 'quantity', label: 'Số lượng', type: 'number' }
            ]
          }
        ]
      },
      {
        key: 'project-budgets',
        title: 'Ngân sách dự án',
        description: 'Ngân sách chi tiết cho từng dự án.',
        listEndpoint: '/projects/budgets',
        columns: ['id', 'projectId', 'budgetType', 'amount'],
        actions: [
          {
            key: 'create-project-budget',
            label: 'Thêm ngân sách',
            method: 'POST',
            endpoint: '/projects/budgets',
            fields: [
              { name: 'projectId', label: 'Mã dự án', required: true },
              { name: 'budgetType', label: 'Loại ngân sách', required: true },
              { name: 'amount', label: 'Số tiền', type: 'number', required: true }
            ]
          }
        ]
      },
      {
        key: 'time-entries',
        title: 'Bảng công',
        description: 'Bảng công nhân sự.',
        listEndpoint: '/projects/time-entries',
        columns: ['id', 'projectId', 'employeeId', 'workDate', 'hours', 'note'],
        actions: [
          {
            key: 'create-time-entry',
            label: 'Tạo bản ghi công',
            method: 'POST',
            endpoint: '/projects/time-entries',
            fields: [
              { name: 'projectId', label: 'Mã dự án' },
              { name: 'employeeId', label: 'Mã nhân viên', required: true },
              { name: 'workDate', label: 'Ngày làm', type: 'date', required: true },
              { name: 'hours', label: 'Số giờ', type: 'number', required: true },
              { name: 'note', label: 'Ghi chú', type: 'textarea' }
            ]
          }
        ]
      }
    ]
  },
  workflows: {
    key: 'workflows',
    title: 'Quy trình',
    summary: 'Định nghĩa quy trình và theo dõi phiên duyệt nghiệp vụ.',
    highlights: ['Phiên bản quy trình', 'Theo dõi thực thi', 'Lưu vết phê duyệt'],
    features: [
      {
        key: 'workflow-definitions',
        title: 'Định nghĩa quy trình',
        description: 'Mẫu quy trình cho từng phân hệ.',
        listEndpoint: '/workflows/definitions',
        columns: ['id', 'code', 'name', 'module', 'version', 'status'],
        actions: [
          {
            key: 'create-definition',
            label: 'Tạo định nghĩa',
            method: 'POST',
            endpoint: '/workflows/definitions',
            fields: [
              { name: 'code', label: 'Mã quy trình' },
              { name: 'name', label: 'Tên quy trình', required: true },
              { name: 'module', label: 'Phân hệ', required: true },
              { name: 'version', label: 'Phiên bản', type: 'number', defaultValue: 1 },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS, defaultValue: 'ACTIVE' }
            ]
          },
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
  },
  reports: {
    key: 'reports',
    title: 'Báo cáo',
    summary: 'Tổng hợp KPI đa phân hệ và cấu hình mẫu báo cáo tùy biến.',
    highlights: ['KPI tổng quan', 'Xem dữ liệu theo phân hệ', 'Lưu mẫu báo cáo'],
    features: [
      {
        key: 'overview',
        title: 'KPI tổng quan',
        description: 'Số liệu nhanh toàn hệ thống.',
        listEndpoint: '/reports/overview',
        view: 'object',
        actions: []
      },
      {
        key: 'module-snapshot',
        title: 'Dữ liệu theo phân hệ',
        description: 'Tải dữ liệu theo phân hệ mục tiêu.',
        listEndpoint: '/reports/module?name=sales',
        columns: ['id', 'status', 'createdAt'],
        actions: [
          {
            key: 'load-module-data',
            label: 'Tải dữ liệu phân hệ',
            method: 'GET',
            endpoint: '/reports/module?name=:moduleName',
            fields: [
              {
                name: 'moduleName',
                label: 'Tên phân hệ',
                type: 'select',
                required: true,
                options: [
                  { label: 'Bán hàng', value: 'sales' },
                  { label: 'Nhân sự', value: 'hr' },
                  { label: 'Tài chính', value: 'finance' },
                  { label: 'Chuỗi cung ứng', value: 'scm' },
                  { label: 'Dự án', value: 'projects' },
                  { label: 'Tài sản', value: 'assets' }
                ],
                defaultValue: 'sales'
              }
            ]
          }
        ]
      },
      {
        key: 'report-definitions',
        title: 'Mẫu báo cáo',
        description: 'Lưu cấu hình báo cáo.',
        actions: [
          {
            key: 'create-report-definition',
            label: 'Lưu mẫu báo cáo',
            method: 'POST',
            endpoint: '/reports',
            fields: [
              { name: 'reportType', label: 'Loại báo cáo', required: true, placeholder: 'tong_hop' },
              { name: 'name', label: 'Tên báo cáo', required: true },
              {
                name: 'moduleName',
                label: 'Phân hệ nguồn dữ liệu',
                type: 'select',
                options: [
                  { label: 'Bán hàng', value: 'sales' },
                  { label: 'Nhân sự', value: 'hr' },
                  { label: 'Tài chính', value: 'finance' },
                  { label: 'Chuỗi cung ứng', value: 'scm' },
                  { label: 'Dự án', value: 'projects' },
                  { label: 'Tài sản', value: 'assets' }
                ],
                defaultValue: 'sales'
              },
              {
                name: 'groupBy',
                label: 'Nhóm dữ liệu theo',
                type: 'select',
                options: [
                  { label: 'Ngày', value: 'day' },
                  { label: 'Tuần', value: 'week' },
                  { label: 'Tháng', value: 'month' }
                ],
                defaultValue: 'day'
              },
              { name: 'limit', label: 'Số bản ghi tối đa', type: 'number', defaultValue: 50 },
              { name: 'generatedAt', label: 'Thời điểm tạo', type: 'datetime-local' }
            ]
          }
        ]
      }
    ]
  },
  settings: {
    key: 'settings',
    title: 'Cài đặt',
    summary: 'Quản trị cấu hình từng tenant và chính sách vận hành.',
    highlights: ['Cấu hình hệ thống', 'Chính sách vận hành', 'Đồng bộ dữ liệu từ BHTOT_CTV'],
    features: [
      {
        key: 'system-config',
        title: 'Cấu hình hệ thống',
        description: 'Cấu hình vận hành chính cho từng tenant.',
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
        title: 'Đồng bộ dữ liệu từ BHTOT_CTV',
        description:
          'Thiết lập địa chỉ máy chủ + khóa API và đồng bộ 1 chiều dữ liệu đơn hàng, CTV, xe, nhân viên từ BHTOT_CTV vào ERP.',
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
  },
  notifications: {
    key: 'notifications',
    title: 'Thông báo',
    summary: 'Trung tâm thông báo nội bộ cho các tác vụ ERP quan trọng.',
    highlights: ['Danh sách thông báo', 'Tạo thông báo thủ công', 'Đánh dấu đã đọc'],
    features: [
      {
        key: 'notification-center',
        title: 'Trung tâm thông báo',
        description: 'Danh sách thông báo và xử lý đã đọc/chưa đọc.',
        listEndpoint: '/notifications',
        columns: ['id', 'userId', 'title', 'content', 'isRead', 'createdAt'],
        actions: [
          {
            key: 'create-notification',
            label: 'Tạo thông báo',
            method: 'POST',
            endpoint: '/notifications',
            fields: [
              { name: 'userId', label: 'Mã người dùng (không bắt buộc)' },
              { name: 'title', label: 'Tiêu đề', required: true },
              { name: 'content', label: 'Nội dung', type: 'textarea' }
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
  }
};

export function getModuleDefinition(moduleKey: string): ModuleDefinition {
  const module = moduleDefinitions[moduleKey];
  if (!module) {
    return {
      key: moduleKey,
      title: moduleKey.toUpperCase(),
      summary: 'Phân hệ chưa được cấu hình.',
      highlights: ['Cần thêm cấu hình cho phân hệ này'],
      features: []
    };
  }

  return module;
}
