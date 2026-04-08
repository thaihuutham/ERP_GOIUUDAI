import type { ActionPreset } from './module-ui';

const ACTION_PRESETS: Record<string, ActionPreset[]> = {
  'create-customer-360': [
    {
      label: 'Khách lẻ cửa hàng',
      description: 'Preset cho khách mua tại cửa hàng.',
      values: {
        fullName: 'Khách lẻ Retail',
        phone: '0909000111',
        segment: 'Khách lẻ',
        tags: 'moi, khach_le',
        status: 'ACTIVE'
      }
    },
    {
      label: 'Khách doanh nghiệp',
      description: 'Preset cho tài khoản B2B.',
      values: {
        fullName: 'Công ty Minh Long',
        phone: '0909555777',
        email: 'procurement@minhlong.vn',
        segment: 'Doanh nghiệp',
        tags: 'b2b, uu_tien',
        status: 'ACTIVE'
      }
    }
  ],
  'create-product': [
    {
      label: 'SKU bán lẻ',
      values: {
        sku: 'SKU-RETAIL-001',
        name: 'Sản phẩm bán lẻ tiêu chuẩn',
        productType: 'PRODUCT',
        unitPrice: 299000,
        status: 'ACTIVE'
      }
    },
    {
      label: 'Gói dịch vụ',
      values: {
        sku: 'SVC-PLAN-001',
        name: 'Gói hỗ trợ cao cấp',
        productType: 'SERVICE',
        unitPrice: 1999000,
        status: 'ACTIVE'
      }
    }
  ],
  'create-order': [
    {
      label: 'Đơn bán lẻ mẫu',
      values: {
        orderNo: 'SO-RETAIL-2026-001',
        customerName: 'Khách lẻ Retail',
        createdBy: 'sales_user_01',
        productName: 'Sản phẩm bán lẻ tiêu chuẩn',
        quantity: 1,
        unitPrice: 299000
      }
    },
    {
      label: 'Đơn B2B mẫu',
      values: {
        orderNo: 'SO-B2B-2026-001',
        customerName: 'Công ty Minh Long',
        createdBy: 'sales_manager_01',
        productName: 'Gói hỗ trợ cao cấp',
        quantity: 12,
        unitPrice: 1500000
      }
    }
  ],
  'create-employee': [
    {
      label: 'Nhân viên văn phòng',
      values: {
        code: 'EMP-OPS-001',
        fullName: 'Nguyễn Văn Vận Hành',
        department: 'Vận hành',
        position: 'Nhân viên',
        baseSalary: 12000000,
        status: 'ACTIVE'
      }
    },
    {
      label: 'Nhân viên kho',
      values: {
        code: 'EMP-WH-001',
        fullName: 'Trần Thị Kho',
        department: 'Kho',
        position: 'Nhân viên kho',
        baseSalary: 9800000,
        status: 'ACTIVE'
      }
    }
  ],
  'create-leave': [
    {
      label: 'Nghỉ phép năm',
      values: {
        leaveType: 'annual',
        reason: 'Nghỉ phép thường niên'
      }
    },
    {
      label: 'Nghỉ không lương',
      values: {
        leaveType: 'unpaid',
        reason: 'Xử lý việc cá nhân'
      }
    }
  ],
  'create-invoice': [
    {
      label: 'Hóa đơn bán hàng (AR)',
      values: {
        invoiceNo: 'INV-AR-2026-001',
        invoiceType: 'AR',
        partnerName: 'Khách bán lẻ',
        totalAmount: 5000000,
        status: 'PENDING'
      }
    },
    {
      label: 'Hóa đơn nhà cung cấp (AP)',
      values: {
        invoiceNo: 'INV-AP-2026-001',
        invoiceType: 'AP',
        partnerName: 'Nhà cung cấp nguồn hàng',
        totalAmount: 3200000,
        status: 'PENDING'
      }
    }
  ],
  'create-vendor': [
    {
      label: 'Nhà cung cấp nội địa',
      values: {
        code: 'VND-LOCAL-001',
        name: 'Nhà Cung Cấp Nội Địa',
        phone: '0281234567',
        email: 'local.vendor@erp.vn',
        status: 'ACTIVE'
      }
    },
    {
      label: 'Nhà cung cấp nhập khẩu',
      values: {
        code: 'VND-IMP-001',
        name: 'Đối tác Nhập khẩu',
        phone: '0901234999',
        email: 'import.partner@erp.vn',
        status: 'ACTIVE'
      }
    }
  ],
  'create-po': [
    {
      label: 'PO nhập hàng chuẩn',
      values: {
        poNo: 'PO-2026-001',
        totalAmount: 24000000,
        status: 'PENDING'
      }
    }
  ],
  'create-asset': [
    {
      label: 'Laptop văn phòng',
      values: {
        assetCode: 'AST-LAP-001',
        name: 'Laptop Dell Văn phòng',
        category: 'CNTT',
        value: 18500000,
        status: 'ACTIVE'
      }
    },
    {
      label: 'Máy quét kho',
      values: {
        assetCode: 'AST-SCN-001',
        name: 'Máy quét kho',
        category: 'Kho',
        value: 6500000,
        status: 'ACTIVE'
      }
    }
  ],
  'create-project': [
    {
      label: 'Rollout chi nhánh mới',
      values: {
        code: 'PRJ-ROLL-001',
        name: 'Mở rộng cửa hàng Quý 2',
        description: 'Mở rộng vận hành chi nhánh mới',
        status: 'PENDING'
      }
    },
    {
      label: 'Tối ưu eCommerce',
      values: {
        code: 'PRJ-ECOM-001',
        name: 'Nước rút tăng trưởng thương mại điện tử',
        description: 'Nâng tỷ lệ chuyển đổi kênh online',
        status: 'PENDING'
      }
    }
  ],
  'create-definition': [
    {
      label: 'Luồng duyệt giảm giá',
      values: {
        code: 'WF-SALES-DISCOUNT',
        name: 'Duyệt giảm giá bán hàng',
        module: 'sales',
        version: 1,
        status: 'ACTIVE'
      }
    }
  ],
  'create-report-definition': [
    {
      label: 'Báo cáo doanh thu tháng',
      values: {
        reportType: 'monthly_sales',
        name: 'Tổng hợp doanh thu tháng',
        moduleName: 'sales',
        groupBy: 'day',
        limit: 100
      }
    },
    {
      label: 'Báo cáo nhân sự',
      values: {
        reportType: 'hr_overview',
        name: 'Tổng quan nhân sự',
        moduleName: 'hr',
        groupBy: 'month',
        limit: 60
      }
    }
  ],
  'save-system-config': [
    {
      label: 'Preset GOIUUDAI',
      values: {
        companyName: 'GOIUUDAI',
        taxCode: '0312345678',
        address: 'Thành phố Hồ Chí Minh',
        currency: 'VND',
        dateFormat: 'DD/MM/YYYY'
      }
    }
  ],
  'save-bhtot-sync-config': [
    {
      label: 'BHTOT nội bộ',
      values: {
        enabled: true,
        baseUrl: 'http://localhost:8080',
        apiKey: 'change_me_bhtot_secret',
        timeoutMs: 12000,
        ordersStateKey: 'bhtot_orders',
        usersStateKey: 'bhtot_users',
        syncAllUsersAsEmployees: false
      }
    }
  ],
  'create-notification': [
    {
      label: 'Thông báo vận hành',
      values: {
        title: 'Cập nhật vận hành',
        content: 'Vui lòng kiểm tra backlog đơn hàng cần duyệt trong ngày.'
      }
    },
    {
      label: 'Thông báo khẩn',
      values: {
        title: 'Yêu cầu xử lý khẩn',
        content: 'Có đơn hàng vượt ngưỡng cần phê duyệt ngay.'
      }
    }
  ],
  'create-customer-interaction': [
    {
      label: 'Tư vấn qua Zalo',
      values: {
        interactionType: 'TU_VAN',
        channel: 'ZALO'
      }
    },
    {
      label: 'Nhắc thanh toán',
      values: {
        interactionType: 'NHAC_THANH_TOAN',
        channel: 'CALL'
      }
    }
  ],
  'create-payment-request': [
    {
      label: 'Gửi QR qua Zalo',
      values: {
        channel: 'ZALO',
        status: 'DA_GUI'
      }
    },
    {
      label: 'Gửi hóa đơn qua Email',
      values: {
        channel: 'EMAIL',
        status: 'DA_GUI'
      }
    }
  ]
};

export function getRecommendedPresets(actionKey: string): ActionPreset[] {
  return ACTION_PRESETS[actionKey] ?? [];
}
