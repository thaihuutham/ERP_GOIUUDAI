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

const ATTENDANCE_METHOD_OPTIONS = [
  { label: 'Remote (check-in online)', value: 'REMOTE_TRACKED' },
  { label: 'Văn phòng (Excel cuối tháng)', value: 'OFFICE_EXCEL' },
  { label: 'Miễn chấm công', value: 'EXEMPT' }
];

const PRODUCT_TYPE_OPTIONS = [
  { label: 'Hàng hóa', value: 'PRODUCT' },
  { label: 'Dịch vụ', value: 'SERVICE' }
];

const ASSET_LIFECYCLE_OPTIONS = [
  { label: 'Mua sắm', value: 'PROCURE' },
  { label: 'Đang sử dụng', value: 'IN_USE' },
  { label: 'Bảo trì', value: 'MAINTENANCE' },
  { label: 'Ngừng sử dụng', value: 'RETIRED' }
];

const ASSET_LIFECYCLE_ACTION_OPTIONS = [
  { label: 'Kích hoạt sử dụng', value: 'ACTIVATE' },
  { label: 'Chuyển bảo trì', value: 'SEND_MAINTENANCE' },
  { label: 'Kết thúc bảo trì', value: 'RETURN_MAINTENANCE' },
  { label: 'Ngừng sử dụng', value: 'RETIRE' }
];

const ASSET_DEPRECIATION_METHOD_OPTIONS = [
  { label: 'Đường thẳng', value: 'STRAIGHT_LINE' },
  { label: 'Số dư giảm dần', value: 'DECLINING_BALANCE' }
];

const PROJECT_RESOURCE_TYPE_OPTIONS = [
  { label: 'Nhân sự', value: 'NHAN_SU' },
  { label: 'Thiết bị', value: 'THIET_BI' },
  { label: 'Phần mềm', value: 'PHAN_MEM' },
  { label: 'Dịch vụ ngoài', value: 'DICH_VU_NGOAI' }
];

const PROJECT_BUDGET_TYPE_OPTIONS = [
  { label: 'Kế hoạch', value: 'PLAN' },
  { label: 'Thực tế', value: 'ACTUAL' },
  { label: 'Dự phòng', value: 'RESERVE' }
];

const PROJECT_TASK_STATUS_OPTIONS = [{ label: 'Tất cả', value: 'ALL' }, ...STATUS_OPTIONS];

const REPORT_MODULE_OPTIONS = [
  { label: 'Bán hàng', value: 'sales' },
  { label: 'CRM', value: 'crm' },
  { label: 'Danh mục', value: 'catalog' },
  { label: 'Nhân sự', value: 'hr' },
  { label: 'Tài chính', value: 'finance' },
  { label: 'Chuỗi cung ứng', value: 'scm' },
  { label: 'Dự án', value: 'projects' },
  { label: 'Tài sản', value: 'assets' },
  { label: 'Quy trình', value: 'workflows' }
];

const REPORT_OUTPUT_FORMAT_OPTIONS = [
  { label: 'JSON', value: 'JSON' },
  { label: 'CSV', value: 'CSV' },
  { label: 'Excel (XLSX)', value: 'XLSX' },
  { label: 'PDF', value: 'PDF' }
];

const REPORT_SCHEDULE_RULE_OPTIONS = [
  { label: 'Theo giờ (1h)', value: 'HOURLY:1' },
  { label: 'Hàng ngày', value: 'DAILY:1' },
  { label: 'Hàng tuần', value: 'WEEKLY:1' }
];

const REPORT_GROUP_BY_OPTIONS = [
  { label: 'Ngày', value: 'day' },
  { label: 'Tuần', value: 'week' },
  { label: 'Tháng', value: 'month' }
];

export const moduleDefinitions: Record<string, ModuleDefinition> = {
  crm: {
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
            label: 'Lưu trữ khách hàng',
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
  },
  catalog: {
    key: 'catalog',
    title: 'Danh mục',
    summary: 'Board danh mục chuyên sâu: chuẩn hóa sản phẩm, chính sách giá và vòng đời lưu trữ.',
    highlights: ['Danh mục sản phẩm chuẩn', 'Policy giá tập trung', 'Bulk archive theo lô'],
    features: [
      {
        key: 'product-catalog',
        title: 'Danh mục sản phẩm',
        description: 'Danh sách sản phẩm/dịch vụ, hỗ trợ filter và thao tác hàng loạt.',
        listEndpoint: '/catalog/products',
        columns: ['id', 'sku', 'name', 'productType', 'categoryPath', 'pricePolicyCode', 'unitPrice', 'status', 'createdAt'],
        filters: [
          {
            key: 'status',
            label: 'Trạng thái',
            type: 'select',
            options: STATUS_OPTIONS
          },
          {
            key: 'category',
            label: 'Nhóm danh mục',
            placeholder: 'Nhập mã/chuỗi danh mục'
          },
          {
            key: 'includeArchived',
            label: 'Gồm bản ghi đã lưu trữ',
            type: 'checkbox',
            includeInQuery: true
          }
        ],
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
                options: PRODUCT_TYPE_OPTIONS,
                defaultValue: 'PRODUCT'
              },
              { name: 'categoryPath', label: 'Nhóm danh mục', placeholder: 'laptop/business' },
              {
                name: 'pricePolicyCode',
                label: 'Chính sách giá',
                type: 'select',
                options: [
                  { label: 'Bán lẻ chuẩn', value: 'RET-STD' },
                  { label: 'Bán sỉ chuẩn', value: 'WSL-STD' },
                  { label: 'Khuyến mại', value: 'PROMO' }
                ],
                defaultValue: 'RET-STD'
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
                options: PRODUCT_TYPE_OPTIONS
              },
              { name: 'categoryPath', label: 'Nhóm danh mục' },
              {
                name: 'pricePolicyCode',
                label: 'Chính sách giá',
                type: 'select',
                options: [
                  { label: 'Bán lẻ chuẩn', value: 'RET-STD' },
                  { label: 'Bán sỉ chuẩn', value: 'WSL-STD' },
                  { label: 'Khuyến mại', value: 'PROMO' }
                ]
              },
              { name: 'unitPrice', label: 'Đơn giá', type: 'number' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          },
          {
            key: 'archive-product',
            label: 'Lưu trữ sản phẩm',
            method: 'POST',
            endpoint: '/catalog/products/:id/archive',
            fields: [
              { name: 'id', label: 'Mã sản phẩm', required: true },
              {
                name: 'reason',
                label: 'Lý do lưu trữ',
                type: 'select',
                required: true,
                options: [
                  { label: 'Ngừng kinh doanh', value: 'DISCONTINUED' },
                  { label: 'SKU trùng/đã gộp', value: 'MERGED_DUPLICATE' },
                  { label: 'Không còn hiệu lực', value: 'OBSOLETE' }
                ],
                defaultValue: 'DISCONTINUED'
              },
              { name: 'reference', label: 'Mã tham chiếu', placeholder: 'CAT-ARCH-001' }
            ]
          },
          {
            key: 'set-product-price-policy',
            label: 'Áp chính sách giá',
            method: 'POST',
            endpoint: '/catalog/products/:id/price-policy',
            fields: [
              { name: 'id', label: 'Mã sản phẩm', required: true },
              {
                name: 'policyCode',
                label: 'Chính sách giá',
                type: 'select',
                required: true,
                options: [
                  { label: 'Bán lẻ chuẩn', value: 'RET-STD' },
                  { label: 'Bán sỉ chuẩn', value: 'WSL-STD' },
                  { label: 'Khuyến mại', value: 'PROMO' }
                ],
                defaultValue: 'RET-STD'
              },
              { name: 'unitPrice', label: 'Đơn giá override', type: 'number' },
              {
                name: 'reason',
                label: 'Lý do override',
                type: 'select',
                required: true,
                options: [
                  { label: 'Điều chỉnh theo chương trình giá', value: 'PRICE_CAMPAIGN' },
                  { label: 'Điều chỉnh khẩn', value: 'URGENT_OVERRIDE' }
                ],
                defaultValue: 'PRICE_CAMPAIGN'
              },
              { name: 'reference', label: 'Mã tham chiếu', required: true, placeholder: 'PRICE-REF-001' }
            ]
          }
        ]
      }
    ]
  },
  sales: {
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
  },
  hr: {
    key: 'hr',
    title: 'Nhân sự',
    summary: 'Quản trị nhân sự toàn diện: tổ chức, nhân viên, công, phép, lương, tuyển dụng.',
    highlights: ['Danh mục nhân sự chuẩn', 'Chính sách phép tập trung', 'Bảng lương minh bạch'],
    features: [
      {
        key: 'employees',
        title: 'Hồ sơ nhân sự',
        description: 'Danh sách và cập nhật hồ sơ nhân viên.',
        listEndpoint: '/hr/employees',
        columns: [
          'id',
          'code',
          'fullName',
          'department',
          'position',
          'joinDate',
          'employmentType',
          'attendanceMethod',
          'baseSalary',
          'status'
        ],
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
              {
                name: 'attendanceMethod',
                label: 'Phương pháp chấm công',
                type: 'select',
                options: ATTENDANCE_METHOD_OPTIONS,
                defaultValue: 'REMOTE_TRACKED'
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
              {
                name: 'attendanceMethod',
                label: 'Phương pháp chấm công',
                type: 'select',
                options: ATTENDANCE_METHOD_OPTIONS
              },
              { name: 'workShiftId', label: 'Mã ca làm việc' },
              { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS_OPTIONS }
            ]
          },
          {
            key: 'archive-employee',
            label: 'Lưu trữ nhân viên',
            method: 'DELETE',
            endpoint: '/hr/employees/:id',
            fields: [{ name: 'id', label: 'Mã nhân viên', required: true }]
          }
        ]
      },
      {
        key: 'departments',
        title: 'Cơ cấu phòng ban',
        description: 'Quản lý danh mục phòng ban và trạng thái hoạt động.',
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
        description: 'Thiết lập ca làm và quy tắc tăng ca.',
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
        description: 'Hạn mức nghỉ phép theo loại nghỉ và quy tắc duyệt.',
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
        description: 'Lưu lịch sử hợp đồng, mức lương và trạng thái hiệu lực.',
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
        description: 'Danh mục khoản cộng/trừ cho bảng lương.',
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
          },
          {
            key: 'archive-payroll-component',
            label: 'Lưu trữ cấu phần',
            method: 'DELETE',
            endpoint: '/hr/payroll-components/:id',
            fields: [{ name: 'id', label: 'Mã cấu phần', required: true }]
          }
        ]
      },
      {
        key: 'attendance',
        title: 'Bàn chấm công',
        description: 'Theo dõi chấm công và thao tác vào/ra ca.',
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
        description: 'Quản lý đơn nghỉ phép, hạn mức còn lại và phê duyệt.',
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
        description: 'Tạo bảng lương theo kỳ và theo dõi chi tiết.',
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
          },
          {
            key: 'archive-payroll',
            label: 'Lưu trữ bảng lương',
            method: 'DELETE',
            endpoint: '/hr/payrolls/:id',
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
          },
          {
            key: 'archive-recruitment',
            label: 'Lưu trữ tuyển dụng',
            method: 'DELETE',
            endpoint: '/hr/recruitment/:id',
            fields: [{ name: 'id', label: 'Mã hồ sơ tuyển dụng', required: true }]
          }
        ]
      },
      {
        key: 'training',
        title: 'Theo dõi đào tạo',
        description: 'Quản lý khóa đào tạo và mức độ hoàn thành.',
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
        description: 'Quản lý hồ sơ và bản ghi thuế TNCN theo kỳ.',
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
        description: 'Thiết lập mục tiêu theo nhân viên và theo dõi tiến độ.',
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
        key: 'hr-events',
        title: 'Lịch sử vòng đời nhân sự',
        description: 'Theo dõi sự kiện nhân sự: tiếp nhận, điều chuyển, nghỉ việc, duyệt phép.',
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
              { name: 'fromDepartment', label: 'Từ phòng ban' },
              { name: 'toDepartment', label: 'Đến phòng ban' },
              { name: 'fromPosition', label: 'Từ vị trí' },
              { name: 'toPosition', label: 'Đến vị trí' },
              { name: 'reasonNote', label: 'Lý do thay đổi', type: 'textarea' },
              { name: 'note', label: 'Ghi chú bổ sung', type: 'textarea' },
              { name: 'referenceCode', label: 'Mã tham chiếu' }
            ]
          }
        ]
      }
    ]
  },
  finance: {
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
  },
  scm: {
    key: 'scm',
    title: 'Chuỗi cung ứng',
    summary: 'Vận hành chuỗi cung ứng từ nhà cung cấp đến phân phối và dự báo nhu cầu.',
    highlights: ['Nhà cung cấp và PO', 'Vận chuyển và phân phối', 'Dự báo nhu cầu và rủi ro'],
    features: [
      {
        key: 'vendors',
        title: 'Danh mục nhà cung cấp',
        description: 'Quản lý danh mục nhà cung cấp.',
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
        description: 'Theo dõi đơn mua hàng theo trạng thái.',
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
        description: 'Theo dõi vận đơn và tiến độ giao nhận.',
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
        description: 'Quản lý lệnh phân phối theo điểm đến.',
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
        description: 'Dự báo nhu cầu theo SKU và kỳ.',
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
  },
  projects: {
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
  },
  reports: {
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
  },
  settings: {
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
  },
  notifications: {
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
  }
};

export function getModuleDefinition(moduleKey: string): ModuleDefinition {
  const module = moduleDefinitions[moduleKey];
  if (!module) {
    return {
      key: moduleKey,
      title: moduleKey.toUpperCase(),
      summary: 'Phân hệ chưa được cấu hình.',
      highlights: ['Cần bổ sung cấu hình cho phân hệ này'],
      features: []
    };
  }

  return module;
}
