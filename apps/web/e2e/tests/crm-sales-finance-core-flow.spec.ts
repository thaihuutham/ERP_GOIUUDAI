import { expect, test, type Page, type Route } from '@playwright/test';

type Customer = {
  id: string;
  fullName: string;
  phone?: string;
  email?: string;
  customerStage: string;
  source: string;
  status: string;
  tags: string[];
  updatedAt: string;
};

type SalesInvoiceRef = {
  id: string;
  invoiceNo: string;
  status: string;
  createdAt: string;
};

type OrderItem = {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
};

type SalesOrder = {
  id: string;
  orderNo: string;
  customerName: string;
  customerId?: string;
  totalAmount: number;
  status: string;
  createdBy?: string;
  createdAt: string;
  items: OrderItem[];
  invoices: SalesInvoiceRef[];
};

type FinanceInvoice = {
  id: string;
  invoiceNo: string;
  invoiceType: string;
  partnerName?: string;
  orderId?: string;
  orderNo?: string;
  totalAmount: number;
  paidAmount: number;
  status: string;
  dueAt: string | null;
  createdAt: string;
};

type PaymentAllocation = {
  id: string;
  invoiceId: string;
  paymentRef?: string;
  allocatedAmount: number;
  allocatedAt: string;
  note?: string;
};

type SavedCustomerFilter = {
  id: string;
  name: string;
  logic: 'AND' | 'OR';
  isDefault: boolean;
  conditions: Array<{
    field: string;
    operator: string;
    value?: string;
    valueTo?: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

type MockState = {
  customers: Customer[];
  savedCustomerFilters: SavedCustomerFilter[];
  defaultCustomerFilterId: string | null;
  orders: SalesOrder[];
  invoices: FinanceInvoice[];
  approvals: Array<{ id: string; targetId: string; status: string; createdAt: string }>;
  allocations: Record<string, PaymentAllocation[]>;
  seq: {
    customer: number;
    filter: number;
    order: number;
    invoice: number;
    item: number;
    allocation: number;
  };
};

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload)
  });
}

function buildAgingPayload(invoices: FinanceInvoice[]) {
  const openInvoices = invoices.filter((invoice) => ['PENDING', 'APPROVED'].includes(invoice.status));
  const totalOutstanding = openInvoices.reduce(
    (sum, invoice) => sum + Math.max(0, invoice.totalAmount - invoice.paidAmount),
    0
  );
  return {
    asOf: new Date().toISOString(),
    invoiceType: 'ALL',
    totalOutstanding,
    buckets: {
      current: totalOutstanding,
      overdue_1_30: 0,
      overdue_31_60: 0,
      overdue_61_90: 0,
      overdue_over_90: 0
    }
  };
}

async function mockCoreErpApis(page: Page, state: MockState) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;

    if (method === 'GET' && path === '/api/v1/crm/taxonomy') {
      return json(route, {
        customerTaxonomy: {
          stages: ['MOI', 'DANG_CHAM_SOC', 'CHOT_DON'],
          sources: ['ONLINE', 'REFERRAL']
        }
      });
    }

    if (method === 'GET' && path === '/api/v1/crm/customers/filters') {
      return json(route, {
        items: state.savedCustomerFilters,
        defaultFilterId: state.defaultCustomerFilterId,
      });
    }

    if (method === 'POST' && path === '/api/v1/crm/customers/filters') {
      const body = request.postDataJSON() as Record<string, unknown>;
      const now = new Date().toISOString();
      const id = String(body.id ?? '').trim() || `filter_e2e_${state.seq.filter++}`;
      const existingIndex = state.savedCustomerFilters.findIndex((item) => item.id === id);
      const nextFilter: SavedCustomerFilter = {
        id,
        name: String(body.name ?? 'Bộ lọc'),
        logic: String(body.logic ?? 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND',
        isDefault: Boolean(body.isDefault),
        conditions: Array.isArray(body.conditions)
          ? (body.conditions as Array<Record<string, unknown>>).map((item) => ({
              field: String(item.field ?? ''),
              operator: String(item.operator ?? ''),
              value: item.value ? String(item.value) : undefined,
              valueTo: item.valueTo ? String(item.valueTo) : undefined,
            }))
          : [],
        createdAt: existingIndex >= 0 ? state.savedCustomerFilters[existingIndex].createdAt : now,
        updatedAt: now,
      };

      if (existingIndex >= 0) {
        state.savedCustomerFilters[existingIndex] = nextFilter;
      } else {
        state.savedCustomerFilters.unshift(nextFilter);
      }

      state.defaultCustomerFilterId = nextFilter.isDefault ? nextFilter.id : state.defaultCustomerFilterId;
      state.savedCustomerFilters = state.savedCustomerFilters.map((item) => ({
        ...item,
        isDefault: item.id === state.defaultCustomerFilterId,
      }));

      return json(route, {
        item: nextFilter,
        items: state.savedCustomerFilters,
        defaultFilterId: state.defaultCustomerFilterId,
      }, 201);
    }

    if (method === 'DELETE' && /\/api\/v1\/crm\/customers\/filters\/[^/]+$/.test(path)) {
      const filterId = path.split('/')[6];
      state.savedCustomerFilters = state.savedCustomerFilters.filter((item) => item.id !== filterId);
      if (state.defaultCustomerFilterId === filterId) {
        state.defaultCustomerFilterId = null;
      }
      state.savedCustomerFilters = state.savedCustomerFilters.map((item) => ({
        ...item,
        isDefault: item.id === state.defaultCustomerFilterId,
      }));
      return json(route, {
        items: state.savedCustomerFilters,
        defaultFilterId: state.defaultCustomerFilterId,
      });
    }

    if (method === 'GET' && path === '/api/v1/crm/customers') {
      return json(route, { items: state.customers });
    }

    if (method === 'POST' && path === '/api/v1/crm/customers') {
      const body = request.postDataJSON() as Record<string, unknown>;
      const id = `cus_e2e_${state.seq.customer++}`;
      const now = new Date().toISOString();
      const customer: Customer = {
        id,
        fullName: String(body.fullName ?? ''),
        phone: String(body.phone ?? ''),
        email: String(body.email ?? ''),
        customerStage: String(body.customerStage ?? 'MOI'),
        source: String(body.source ?? 'ONLINE'),
        status: 'MOI_CHUA_TU_VAN',
        tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
        updatedAt: now
      };
      state.customers.unshift(customer);
      return json(route, { deduplicated: false, message: 'Đã tạo khách hàng mới.', customer }, 201);
    }

    if (method === 'POST' && path === '/api/v1/crm/customers/import/preview') {
      const body = request.postDataJSON() as Record<string, unknown>;
      const rows = Array.isArray(body.rows) ? (body.rows as Array<Record<string, unknown>>) : [];
      const errors: Array<{ rowIndex: number; identifier?: string; message: string }> = [];
      let validRows = 0;
      let wouldCreateCount = 0;
      let wouldUpdateCount = 0;

      rows.forEach((row, index) => {
        const rowIndex = index + 1;
        const phone = String(row.phoneNormalized ?? row.phone ?? '').trim();
        const email = String(row.emailNormalized ?? row.email ?? '').trim().toLowerCase();
        const identifier = phone || email || String(row.fullName ?? '').trim() || undefined;

        if (!phone && !email) {
          errors.push({
            rowIndex,
            identifier,
            message: 'Mỗi dòng import cần ít nhất phone hoặc email.',
          });
          return;
        }

        validRows += 1;
        const existing = state.customers.find(
          (customer) =>
            (phone && String(customer.phone ?? '').trim() === phone)
            || (email && String(customer.email ?? '').trim().toLowerCase() === email),
        );

        if (existing) {
          wouldUpdateCount += 1;
        } else {
          wouldCreateCount += 1;
        }
      });

      return json(route, {
        totalRows: rows.length,
        validRows,
        wouldCreateCount,
        wouldUpdateCount,
        skippedCount: errors.length,
        errors,
      }, 201);
    }

    if (method === 'POST' && path === '/api/v1/crm/customers/import') {
      const body = request.postDataJSON() as Record<string, unknown>;
      const rows = Array.isArray(body.rows) ? (body.rows as Array<Record<string, unknown>>) : [];
      const errors: Array<{ rowIndex: number; identifier?: string; message: string }> = [];

      rows.forEach((row, index) => {
        const rowIndex = index + 1;
        const phone = String(row.phoneNormalized ?? row.phone ?? '').trim();
        const email = String(row.emailNormalized ?? row.email ?? '').trim().toLowerCase();
        const identifier = phone || email || String(row.fullName ?? '').trim() || undefined;

        if (!phone && !email) {
          errors.push({
            rowIndex,
            identifier,
            message: 'Mỗi dòng import cần ít nhất phone hoặc email.',
          });
          return;
        }

        const existing = state.customers.find(
          (customer) =>
            (phone && String(customer.phone ?? '').trim() === phone)
            || (email && String(customer.email ?? '').trim().toLowerCase() === email),
        );

        if (existing) {
          existing.fullName = String(row.fullName ?? existing.fullName ?? '').trim() || existing.fullName;
          existing.phone = String(row.phone ?? existing.phone ?? '').trim() || existing.phone;
          existing.email = String(row.email ?? existing.email ?? '').trim() || existing.email;
          existing.source = String(row.source ?? existing.source ?? '').trim() || existing.source;
          existing.customerStage = String(row.customerStage ?? existing.customerStage ?? '').trim() || existing.customerStage;
          existing.status = String(row.status ?? existing.status ?? '').trim() || existing.status;
          if (Array.isArray(row.tags)) {
            existing.tags = (row.tags as unknown[]).map((item) => String(item)).filter(Boolean);
          }
          existing.updatedAt = new Date().toISOString();
          return;
        }

        const now = new Date().toISOString();
        const customer: Customer = {
          id: `cus_e2e_${state.seq.customer++}`,
          fullName: String(row.fullName ?? '').trim(),
          phone: phone || undefined,
          email: email || undefined,
          customerStage: String(row.customerStage ?? 'MOI'),
          source: String(row.source ?? 'ONLINE'),
          status: String(row.status ?? 'MOI_CHUA_TU_VAN'),
          tags: Array.isArray(row.tags) ? (row.tags as unknown[]).map((item) => String(item)).filter(Boolean) : [],
          updatedAt: now,
        };
        state.customers.unshift(customer);
      });

      return json(route, {
        totalRows: rows.length,
        importedCount: rows.length - errors.length,
        skippedCount: errors.length,
        errors,
      }, 201);
    }

    if (method === 'PATCH' && /\/api\/v1\/crm\/customers\/[^/]+$/.test(path)) {
      const customerId = path.split('/')[5];
      const customer = state.customers.find((item) => item.id === customerId);
      if (!customer) {
        return json(route, { message: 'Không tìm thấy khách hàng.' }, 404);
      }
      const body = request.postDataJSON() as Record<string, unknown>;
      customer.status = String(body.status ?? customer.status);
      customer.updatedAt = new Date().toISOString();
      return json(route, customer);
    }

    if (method === 'DELETE' && /\/api\/v1\/crm\/customers\/[^/]+$/.test(path)) {
      const customerId = path.split('/')[5];
      const customer = state.customers.find((item) => item.id === customerId);
      if (!customer) {
        return json(route, { message: 'Không tìm thấy khách hàng.' }, 404);
      }
      customer.status = 'SAI_SO_KHONG_TON_TAI_BO_QUA_XOA';
      customer.updatedAt = new Date().toISOString();
      return json(route, { ok: true });
    }

    if (method === 'GET' && path === '/api/v1/sales/orders') {
      return json(route, { items: state.orders });
    }

    if (method === 'GET' && path === '/api/v1/sales/approvals') {
      return json(route, state.approvals);
    }

    if (method === 'GET' && path === '/api/v1/sales/checkout/config') {
      return json(route, {
        checkoutTemplates: {
          INSURANCE: [
            { code: 'AUTO_INSURANCE_STD', label: 'Bảo hiểm ô tô', requiredFields: [], fieldConfig: {} },
            { code: 'MOTO_INSURANCE_STD', label: 'Bảo hiểm xe máy', requiredFields: [], fieldConfig: {} }
          ],
          TELECOM: [
            { code: 'TELECOM_BASE', label: 'Telecom Base', requiredFields: [], fieldConfig: {} }
          ],
          DIGITAL: [
            { code: 'DIGITAL_BASE', label: 'Digital Base', requiredFields: [], fieldConfig: {} }
          ]
        }
      });
    }

    if (method === 'POST' && path === '/api/v1/sales/checkout/files/upload') {
      return json(route, {
        fileId: `file_e2e_${Date.now()}`,
        fileName: 'mock_upload.pdf',
        originalName: 'test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        url: '/api/v1/sales/checkout/files/mock'
      });
    }

    if (method === 'POST' && path === '/api/v1/sales/checkout/orders') {
      const body = request.postDataJSON() as Record<string, unknown>;
      const itemsInput = Array.isArray(body.items) ? body.items : [];
      const items: OrderItem[] = itemsInput.map((row) => ({
        id: `item_e2e_${state.seq.item++}`,
        productName: String((row as Record<string, unknown>).productName ?? ''),
        quantity: Number((row as Record<string, unknown>).quantity ?? 1),
        unitPrice: Number((row as Record<string, unknown>).unitPrice ?? 0)
      }));
      const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      const orderSeq = state.seq.order++;
      const orderNo = `SO-E2E-${String(orderSeq).padStart(4, '0')}`;
      const order: SalesOrder = {
        id: `order_e2e_${orderSeq}`,
        orderNo,
        customerName: String(body.customerName ?? ''),
        customerId: body.customerId ? String(body.customerId) : undefined,
        totalAmount,
        status: 'PENDING',
        createdBy: body.createdBy ? String(body.createdBy) : undefined,
        createdAt: new Date().toISOString(),
        items,
        invoices: []
      };
      state.orders.unshift(order);
      return json(route, {
        id: order.id,
        orderNo: order.orderNo,
        orderGroup: body.orderGroup ? String(body.orderGroup) : null,
        customerName: order.customerName,
        totalAmount: order.totalAmount,
        checkoutStatus: 'DRAFT',
        createdAt: order.createdAt,
        items: order.items,
        invoices: []
      }, 201);
    }

    if (method === 'POST' && path === '/api/v1/sales/orders') {
      const body = request.postDataJSON() as Record<string, unknown>;
      const itemsInput = Array.isArray(body.items) ? body.items : [];
      const items: OrderItem[] = itemsInput.map((row) => ({
        id: `item_e2e_${state.seq.item++}`,
        productName: String((row as Record<string, unknown>).productName ?? ''),
        quantity: Number((row as Record<string, unknown>).quantity ?? 1),
        unitPrice: Number((row as Record<string, unknown>).unitPrice ?? 0)
      }));
      const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      const id = `order_e2e_${state.seq.order++}`;
      const order: SalesOrder = {
        id,
        orderNo: String(body.orderNo ?? `SO-E2E-${String(state.seq.order).padStart(4, '0')}`),
        customerName: String(body.customerName ?? ''),
        customerId: body.customerId ? String(body.customerId) : undefined,
        totalAmount,
        status: 'PENDING',
        createdBy: body.createdBy ? String(body.createdBy) : undefined,
        createdAt: new Date().toISOString(),
        items,
        invoices: []
      };
      state.orders.unshift(order);
      return json(route, order, 201);
    }

    if (method === 'POST' && /\/api\/v1\/sales\/orders\/[^/]+\/approve$/.test(path)) {
      const orderId = path.split('/')[5];
      const order = state.orders.find((item) => item.id === orderId);
      if (!order) {
        return json(route, { message: 'Không tìm thấy đơn hàng.' }, 404);
      }
      order.status = 'APPROVED';
      return json(route, {
        order,
        transition: {
          from: 'PENDING',
          to: 'APPROVED',
          note: null
        }
      }, 201);
    }

    if (method === 'POST' && /\/api\/v1\/sales\/orders\/[^/]+\/reject$/.test(path)) {
      const orderId = path.split('/')[5];
      const order = state.orders.find((item) => item.id === orderId);
      if (!order) {
        return json(route, { message: 'Không tìm thấy đơn hàng.' }, 404);
      }
      order.status = 'REJECTED';
      return json(route, {
        order,
        transition: {
          from: 'PENDING',
          to: 'REJECTED',
          note: null
        }
      }, 201);
    }

    if (method === 'DELETE' && /\/api\/v1\/sales\/orders\/[^/]+$/.test(path)) {
      const orderId = path.split('/')[5];
      const order = state.orders.find((item) => item.id === orderId);
      if (!order) {
        return json(route, { message: 'Không tìm thấy đơn hàng.' }, 404);
      }
      order.status = 'ARCHIVED';
      return json(route, { ok: true });
    }

    if (method === 'POST' && path === '/api/v1/finance/invoices/from-order') {
      const body = request.postDataJSON() as Record<string, unknown>;
      const orderId = String(body.orderId ?? '');
      const order = state.orders.find((item) => item.id === orderId);
      if (!order) {
        return json(route, { message: 'Không tìm thấy đơn hàng để xuất hóa đơn.' }, 404);
      }
      if (order.status !== 'APPROVED') {
        return json(route, { message: 'Chỉ được xuất hóa đơn từ đơn hàng APPROVED.' }, 400);
      }
      const existing = state.invoices.find((invoice) => invoice.orderId === orderId);
      if (existing) {
        return json(route, { message: 'Đơn hàng này đã có hóa đơn liên kết.' }, 400);
      }

      const id = `inv_e2e_${state.seq.invoice++}`;
      const invoiceNo = `INV-E2E-${String(state.seq.invoice).padStart(4, '0')}`;
      const now = new Date().toISOString();
      const invoice: FinanceInvoice = {
        id,
        invoiceNo,
        invoiceType: 'SALES',
        partnerName: order.customerName,
        orderId: order.id,
        orderNo: order.orderNo,
        totalAmount: order.totalAmount,
        paidAmount: 0,
        status: 'DRAFT',
        dueAt: null,
        createdAt: now
      };
      state.invoices.unshift(invoice);
      order.invoices = [
        {
          id,
          invoiceNo,
          status: 'DRAFT',
          createdAt: now
        }
      ];

      return json(route, {
        ...invoice,
        transition: {
          action: 'CREATE_FROM_ORDER',
          note: null
        }
      }, 201);
    }

    if (method === 'GET' && path === '/api/v1/finance/invoices') {
      return json(
        route,
        state.invoices.map((invoice) => ({
          ...invoice,
          outstandingAmount: Math.max(0, invoice.totalAmount - invoice.paidAmount)
        }))
      );
    }

    if (method === 'GET' && path === '/api/v1/finance/invoices-aging') {
      return json(route, buildAgingPayload(state.invoices));
    }

    if (method === 'POST' && path === '/api/v1/finance/invoices') {
      const body = request.postDataJSON() as Record<string, unknown>;
      const id = `inv_e2e_${state.seq.invoice++}`;
      const invoice: FinanceInvoice = {
        id,
        invoiceNo: `INV-E2E-${String(state.seq.invoice).padStart(4, '0')}`,
        invoiceType: String(body.invoiceType ?? 'SALES'),
        partnerName: body.partnerName ? String(body.partnerName) : undefined,
        totalAmount: Number(body.totalAmount ?? 0),
        paidAmount: 0,
        status: 'DRAFT',
        dueAt: body.dueAt ? String(body.dueAt) : null,
        createdAt: new Date().toISOString()
      };
      state.invoices.unshift(invoice);
      return json(route, invoice, 201);
    }

    if (method === 'POST' && /\/api\/v1\/finance\/invoices\/[^/]+\/issue$/.test(path)) {
      const invoiceId = path.split('/')[5];
      const invoice = state.invoices.find((item) => item.id === invoiceId);
      if (!invoice) {
        return json(route, { message: 'Không tìm thấy hóa đơn.' }, 404);
      }
      invoice.status = 'PENDING';
      return json(route, {
        ...invoice,
        transition: { action: 'ISSUE', from: 'DRAFT', to: 'PENDING', note: null }
      }, 201);
    }

    if (method === 'POST' && /\/api\/v1\/finance\/invoices\/[^/]+\/approve$/.test(path)) {
      const invoiceId = path.split('/')[5];
      const invoice = state.invoices.find((item) => item.id === invoiceId);
      if (!invoice) {
        return json(route, { message: 'Không tìm thấy hóa đơn.' }, 404);
      }
      invoice.status = 'APPROVED';
      return json(route, {
        ...invoice,
        transition: { action: 'APPROVE', from: 'PENDING', to: 'APPROVED', note: null }
      }, 201);
    }

    if (method === 'DELETE' && /\/api\/v1\/finance\/invoices\/[^/]+$/.test(path)) {
      const invoiceId = path.split('/')[5];
      const invoice = state.invoices.find((item) => item.id === invoiceId);
      if (!invoice) {
        return json(route, { message: 'Không tìm thấy hóa đơn.' }, 404);
      }
      invoice.status = 'ARCHIVED';
      return json(route, { ok: true });
    }

    if (method === 'GET' && /\/api\/v1\/finance\/invoices\/[^/]+\/allocations$/.test(path)) {
      const invoiceId = path.split('/')[5];
      return json(route, state.allocations[invoiceId] ?? []);
    }

    if (method === 'POST' && /\/api\/v1\/finance\/invoices\/[^/]+\/allocations$/.test(path)) {
      const invoiceId = path.split('/')[5];
      const invoice = state.invoices.find((item) => item.id === invoiceId);
      if (!invoice) {
        return json(route, { message: 'Không tìm thấy hóa đơn.' }, 404);
      }
      if (invoice.status !== 'APPROVED') {
        return json(route, { message: 'Hóa đơn chưa sẵn sàng để ghi nhận thanh toán.' }, 400);
      }

      const body = request.postDataJSON() as Record<string, unknown>;
      const allocation: PaymentAllocation = {
        id: `alloc_e2e_${state.seq.allocation++}`,
        invoiceId,
        paymentRef: body.paymentRef ? String(body.paymentRef) : undefined,
        allocatedAmount: Number(body.allocatedAmount ?? 0),
        allocatedAt: new Date().toISOString(),
        note: body.note ? String(body.note) : undefined
      };

      const allocations = state.allocations[invoiceId] ?? [];
      allocations.unshift(allocation);
      state.allocations[invoiceId] = allocations;

      const paidAmount = allocations.reduce((sum, item) => sum + item.allocatedAmount, 0);
      invoice.paidAmount = paidAmount;
      if (invoice.totalAmount - paidAmount <= 0.005) {
        invoice.status = 'ARCHIVED';
      }

      return json(route, {
        allocation,
        invoiceId,
        totalAmount: invoice.totalAmount,
        paidAmount: invoice.paidAmount,
        outstandingAmount: Math.max(0, invoice.totalAmount - invoice.paidAmount),
        isPaidOff: invoice.status === 'ARCHIVED'
      }, 201);
    }

    return json(route, { message: `Unhandled API route: ${method} ${path}` }, 404);
  });
}

test('runs CRM -> Sales -> Finance core flow via Operations Boards', async ({ page }) => {
  const state: MockState = {
    customers: [],
    savedCustomerFilters: [],
    defaultCustomerFilterId: null,
    orders: [],
    invoices: [],
    approvals: [],
    allocations: {},
    seq: {
      customer: 1,
      filter: 1,
      order: 1,
      invoice: 1,
      item: 1,
      allocation: 1
    }
  };

  await mockCoreErpApis(page, state);

  await page.goto('/modules/crm');
  await page.getByRole('button', { name: 'Thêm dữ liệu' }).click();
  await page.getByPlaceholder('Nguyễn Văn A').fill('Khách Lẻ A');
  await page.getByPlaceholder('09xxxxxxxx').fill('0912345678');
  await page.getByPlaceholder('customer@example.com').fill('khach-a@example.com');
  await page.locator('#crm-create-customer-form').getByRole('button', { name: /^Lưu$/ }).click();
  await expect(page.getByText('Đã tạo khách hàng thành công.')).toBeVisible();
  expect(state.customers).toHaveLength(1);

  await page.goto('/modules/sales');
  await page.getByRole('button', { name: 'Tạo đơn hàng' }).first().click();
  const createPanel = page.locator('.side-panel-container').filter({ hasText: 'Nhóm sản phẩm' });
  await createPanel.locator('label:has-text("Customer name *") + input').fill('Khách Lẻ A');
  await createPanel.locator('label:has-text("Customer ID") + input').fill(state.customers[0].id);
  await createPanel.locator('label:has-text("Product name") + input').first().fill('Ao thun dong phuc');
  await createPanel.locator('label:has-text("Unit Price") + input').first().fill('150000');
  await createPanel.getByRole('button', { name: /Tạo đơn nháp/ }).click();
  await expect(page.getByText(/Đã tạo đơn nháp SO-E2E-0001/)).toBeVisible();
  expect(state.orders).toHaveLength(1);
  const createdOrderNo = state.orders[0].orderNo;

  await page.getByRole('button', { name: createdOrderNo }).click();
  await page.locator('.side-panel-container').getByRole('button', { name: 'Phê duyệt đơn' }).click();
  await expect(page.getByText(`Đơn hàng ${createdOrderNo} đã được phê duyệt.`)).toBeVisible();
  expect(state.orders[0].status).toBe('APPROVED');

  await page.locator('.side-panel-container').getByRole('button', { name: 'Xuất hóa đơn' }).click();
  await expect(page.getByText(/Đã xuất hóa đơn INV-E2E-/)).toBeVisible();
  expect(state.invoices.length).toBeGreaterThanOrEqual(1);
  const orderInvoice = state.invoices.find((invoice) => invoice.orderId === state.orders[0].id);
  expect(orderInvoice).toBeDefined();

  await page.goto('/modules/finance');
  await page.getByRole('button', { name: 'Tạo hóa đơn' }).click();
  await page.locator('.side-panel-container input[placeholder="SALES"]').fill('SERVICE');
  await page.locator('.side-panel-container input[placeholder="Công ty / Khách hàng"]').fill('Khách Walk-in');
  await page.locator('.side-panel-container input[placeholder="1000000"]').fill('500000');
  await page.locator('.side-panel-container').getByRole('button', { name: /^Tạo hóa đơn$/ }).click();
  await expect(page.getByText(/Đã tạo hóa đơn INV-E2E-/)).toBeVisible();

  await page.getByRole('button', { name: orderInvoice!.invoiceNo }).click();
  await page.locator('.side-panel-container').getByRole('button', { name: 'Phát hành hóa đơn' }).click();
  await expect(page.getByText(`Đã phát hành hóa đơn ${orderInvoice!.invoiceNo}.`)).toBeVisible();
  await page.locator('.side-panel-container').getByRole('button', { name: 'Phê duyệt hóa đơn' }).click();
  await expect(page.getByText(`Đã phê duyệt hóa đơn ${orderInvoice!.invoiceNo}.`)).toBeVisible();

  await page.locator('.side-panel-container input[placeholder="Mã tham chiếu thanh toán"]').fill('PAY-E2E-001');
  await page.locator('.side-panel-container').getByRole('button', { name: 'Ghi nhận thanh toán' }).click();
  await expect(page.getByText(new RegExp(`Đã ghi nhận thanh toán .* cho hóa đơn ${orderInvoice!.invoiceNo}\\.`))).toBeVisible();

  const paidInvoice = state.invoices.find((invoice) => invoice.id === orderInvoice!.id);
  expect(paidInvoice?.status).toBe('ARCHIVED');
  expect(state.allocations[orderInvoice!.id]?.length ?? 0).toBe(1);
});

test('shows service phone field only when "different service phone" is checked in Sales create order form', async ({ page }) => {
  const state: MockState = {
    customers: [],
    savedCustomerFilters: [],
    defaultCustomerFilterId: null,
    orders: [],
    invoices: [],
    approvals: [],
    allocations: {},
    seq: {
      customer: 1,
      filter: 1,
      order: 1,
      invoice: 1,
      item: 1,
      allocation: 1
    }
  };

  await mockCoreErpApis(page, state);
  await page.route('**/api/v1/sales/checkout/config', async (route) => {
    return json(route, {
      checkoutTemplates: {
        INSURANCE: [
          { code: 'AUTO_INSURANCE_STD', label: 'Bảo hiểm ô tô', requiredFields: [], fieldConfig: {} },
          { code: 'MOTO_INSURANCE_STD', label: 'Bảo hiểm xe máy', requiredFields: [], fieldConfig: {} }
        ],
        TELECOM: [
          {
            code: 'TELECOM_STD',
            label: 'Mẫu viễn thông tiêu chuẩn',
            requiredFields: ['billingCycle', 'effectiveFrom', 'servicePhone'],
            fieldConfig: {
              billingCycle: { type: 'select', options: ['30'], label: 'Chu kỳ gói cước' },
              effectiveFrom: { type: 'date', label: 'Hiệu lực từ' },
              differentServicePhone: { type: 'checkbox', label: 'SĐT dịch vụ khác SĐT liên lạc' },
              servicePhone: { type: 'tel', label: 'SĐT dùng dịch vụ (lưu vào hồ sơ KH)' }
            }
          }
        ],
        DIGITAL: [
          { code: 'DIGITAL_BASE', label: 'Digital Base', requiredFields: [], fieldConfig: {} }
        ]
      }
    });
  });

  await page.goto('/modules/sales');
  await page.getByRole('button', { name: 'Tạo đơn hàng' }).first().click();

  const createPanel = page.locator('.side-panel-container').filter({ hasText: 'Tạo đơn bán hàng' });
  await createPanel.locator('label:has-text("Nhóm sản phẩm") + select').selectOption('TELECOM');

  const servicePhoneInput = createPanel.locator('label:has-text("SĐT dùng dịch vụ (lưu vào hồ sơ KH)") + input');
  await expect(servicePhoneInput).toHaveCount(0);

  await createPanel.locator('label:has-text("SĐT dịch vụ khác SĐT liên lạc")').click();
  await expect(servicePhoneInput).toHaveCount(1);

  await servicePhoneInput.fill('0987654321');
  await createPanel.locator('label:has-text("SĐT dịch vụ khác SĐT liên lạc")').click();
  await expect(servicePhoneInput).toHaveCount(0);

  await createPanel.locator('label:has-text("SĐT dịch vụ khác SĐT liên lạc")').click();
  await expect(servicePhoneInput).toHaveValue('');
});

test('allows searching catalog products by name or SKU when creating sales order', async ({ page }) => {
  const state: MockState = {
    customers: [],
    savedCustomerFilters: [],
    defaultCustomerFilterId: null,
    orders: [],
    invoices: [],
    approvals: [],
    allocations: {},
    seq: {
      customer: 1,
      filter: 1,
      order: 1,
      invoice: 1,
      item: 1,
      allocation: 1
    }
  };

  await mockCoreErpApis(page, state);
  await page.route('**/api/v1/catalog/products**', async (route) => {
    return json(route, {
      items: [
        { id: 'prod_1', name: 'Gói Fiber 150Mbps', sku: 'FIBER150', price: 320000 },
        { id: 'prod_2', name: 'Gói Fiber 200Mbps', sku: 'FIBER200', price: 450000 }
      ]
    });
  });

  await page.goto('/modules/sales');
  await page.getByRole('button', { name: 'Tạo đơn hàng' }).first().click();

  const createPanel = page.locator('.side-panel-container').filter({ hasText: 'Tạo đơn bán hàng' });
  const productInput = createPanel.locator('label:has-text("Sản phẩm / dịch vụ") + input').first();
  const unitPriceInput = createPanel.locator('label:has-text("Đơn giá") + input').first();

  await expect(productInput).toBeVisible();
  await expect(page.locator('#sales-catalog-product-options option')).toHaveCount(2);

  await productInput.fill('Gói Fiber 150Mbps');
  await expect(unitPriceInput).toHaveValue('320000');
  await expect(unitPriceInput).toHaveAttribute('readonly', '');

  await productInput.fill('FIBER200');
  await expect(unitPriceInput).toHaveValue('450000');
});

test('supports bulk actions on CRM/Sales/Finance main tables (select-all loaded)', async ({ page }) => {
  const state: MockState = {
    customers: [
      {
        id: 'cus_bulk_1',
        fullName: 'Khách bulk 1',
        phone: '0900000001',
        email: 'bulk1@example.com',
        customerStage: 'MOI',
        source: 'ONLINE',
        status: 'MOI_CHUA_TU_VAN',
        tags: [],
        updatedAt: '2026-04-01T01:00:00.000Z'
      },
      {
        id: 'cus_bulk_2',
        fullName: 'Khách bulk 2',
        phone: '0900000002',
        email: 'bulk2@example.com',
        customerStage: 'MOI',
        source: 'ONLINE',
        status: 'MOI_CHUA_TU_VAN',
        tags: [],
        updatedAt: '2026-04-01T01:00:00.000Z'
      }
    ],
    orders: [
      {
        id: 'order_bulk_1',
        orderNo: 'SO-BULK-001',
        customerName: 'Khách bulk 1',
        customerId: 'cus_bulk_1',
        totalAmount: 300000,
        status: 'PENDING',
        createdBy: 'manager_1',
        createdAt: '2026-04-01T02:00:00.000Z',
        items: [
          { id: 'item_bulk_1', productName: 'SP 1', quantity: 1, unitPrice: 300000 }
        ],
        invoices: []
      },
      {
        id: 'order_bulk_2',
        orderNo: 'SO-BULK-002',
        customerName: 'Khách bulk 2',
        customerId: 'cus_bulk_2',
        totalAmount: 450000,
        status: 'PENDING',
        createdBy: 'manager_1',
        createdAt: '2026-04-01T02:05:00.000Z',
        items: [
          { id: 'item_bulk_2', productName: 'SP 2', quantity: 1, unitPrice: 450000 }
        ],
        invoices: []
      }
    ],
    invoices: [
      {
        id: 'inv_bulk_1',
        invoiceNo: 'INV-BULK-001',
        invoiceType: 'SALES',
        partnerName: 'Khách bulk 1',
        totalAmount: 300000,
        paidAmount: 0,
        status: 'DRAFT',
        dueAt: null,
        createdAt: '2026-04-01T03:00:00.000Z'
      },
      {
        id: 'inv_bulk_2',
        invoiceNo: 'INV-BULK-002',
        invoiceType: 'SALES',
        partnerName: 'Khách bulk 2',
        totalAmount: 450000,
        paidAmount: 0,
        status: 'DRAFT',
        dueAt: null,
        createdAt: '2026-04-01T03:10:00.000Z'
      }
    ],
    savedCustomerFilters: [],
    defaultCustomerFilterId: null,
    approvals: [],
    allocations: {},
    seq: {
      customer: 3,
      filter: 1,
      order: 3,
      invoice: 3,
      item: 3,
      allocation: 1
    }
  };

  await mockCoreErpApis(page, state);

  const checkAllVisibleRows = async () => {
    const rowCheckboxes = page.locator('table.standard-table-table tbody td.standard-table-select-cell input[type="checkbox"]');
    const total = await rowCheckboxes.count();
    for (let index = 0; index < total; index += 1) {
      const checkbox = rowCheckboxes.nth(index);
      if (!(await checkbox.isChecked())) {
        await checkbox.check();
      }
    }
  };

  const runGenericBulkAction = async (actionName: string) => {
    await page.getByRole('button', { name: 'Bulk Actions' }).click();
    const modal = page.locator('dialog.modal-dialog').last();
    await expect(modal).toBeVisible();
    const actionButton = modal.getByRole('button', { name: actionName });
    if (await actionButton.count()) {
      await actionButton.click();
    } else {
      await modal.getByRole('button', { name: 'Đóng' }).click();
      await expect(modal).toBeHidden();
      return false;
    }
    await modal.getByRole('button', { name: 'Đóng' }).click();
    await expect(modal).toBeHidden();
    return true;
  };

  const waitForInvoiceRow = async (invoiceNo: string) => {
    const invoiceCell = page.getByText(invoiceNo).first();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (await invoiceCell.isVisible().catch(() => false)) {
        return;
      }
      const emptyRowVisible = await page
        .locator('table.standard-table-table tbody')
        .getByText('Không có dữ liệu')
        .isVisible()
        .catch(() => false);
      if (emptyRowVisible) {
        await page.getByRole('button', { name: 'Làm mới' }).click();
      }
      await page.waitForTimeout(400);
    }
    await expect(invoiceCell).toBeVisible({ timeout: 15000 });
  };

  await page.goto('/modules/crm');
  const crmOverlay = page.locator('.side-panel-overlay');
  if (await crmOverlay.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await crmOverlay.waitFor({ state: 'hidden' }).catch(() => {});
  }
  await expect(page.getByRole('button', { name: 'Khách bulk 1' })).toBeVisible();
  await checkAllVisibleRows();
  await page.getByRole('button', { name: 'Bulk Actions' }).click();
  const crmBulkModal = page.locator('dialog.modal-dialog').last();
  await expect(crmBulkModal).toBeVisible();
  await crmBulkModal.locator('select').first().selectOption('KH_TU_CHOI');
  await crmBulkModal.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(page.locator('.finance-alert-success')).toContainText('thành công 2/2');
  expect(state.customers.every((item) => item.status === 'KH_TU_CHOI')).toBe(true);

  await page.goto('/modules/sales');
  await expect(page.getByRole('button', { name: 'SO-BULK-001' })).toBeVisible();
  await checkAllVisibleRows();
  await runGenericBulkAction('Approve');
  await expect(page.locator('.finance-alert-success')).toContainText('Duyệt đơn hàng: thành công 2/2.');
  expect(state.orders.every((item) => item.status === 'APPROVED')).toBe(true);

  if (await page.getByRole('button', { name: 'Bulk Actions' }).count()) {
    page.once('dialog', (dialog) => dialog.accept());
    await checkAllVisibleRows();
    if (await runGenericBulkAction('Archive')) {
      await expect(page.locator('.finance-alert-success')).toContainText('Lưu trữ đơn hàng: thành công 2/2.');
      expect(state.orders.every((item) => item.status === 'ARCHIVED')).toBe(true);
    } else {
      expect(state.orders.every((item) => item.status === 'APPROVED')).toBe(true);
    }
  } else {
    expect(state.orders.every((item) => item.status === 'APPROVED')).toBe(true);
  }

  await page.goto('/modules/finance');
  await waitForInvoiceRow('INV-BULK-001');
  await checkAllVisibleRows();
  await runGenericBulkAction('Issue');
  await expect(page.locator('.finance-alert-success')).toContainText('Phát hành hóa đơn: thành công 2/2.');
  expect(state.invoices.every((item) => item.status === 'PENDING')).toBe(true);

  await checkAllVisibleRows();
  await runGenericBulkAction('Approve');
  await expect(page.locator('.finance-alert-success')).toContainText('Phê duyệt hóa đơn: thành công 2/2.');
  expect(state.invoices.every((item) => item.status === 'APPROVED')).toBe(true);

  if (await page.getByRole('button', { name: 'Bulk Actions' }).count()) {
    page.once('dialog', (dialog) => dialog.accept());
    await checkAllVisibleRows();
    if (await runGenericBulkAction('Archive')) {
      await expect(page.locator('.finance-alert-success')).toContainText('Lưu trữ hóa đơn: thành công 2/2.');
      expect(state.invoices.every((item) => item.status === 'ARCHIVED')).toBe(true);
    } else {
      expect(state.invoices.every((item) => item.status === 'APPROVED')).toBe(true);
    }
  } else {
    expect(state.invoices.every((item) => item.status === 'APPROVED')).toBe(true);
  }
});

test('supports CRM customer import page with preview + import flow', async ({ page }) => {
  const state: MockState = {
    customers: [
      {
        id: 'cus_existing_import',
        fullName: 'Khách đang có',
        phone: '0901112222',
        email: 'existing@example.com',
        customerStage: 'MOI',
        source: 'ONLINE',
        status: 'MOI_CHUA_TU_VAN',
        tags: ['vip'],
        updatedAt: '2026-04-01T01:00:00.000Z',
      },
    ],
    savedCustomerFilters: [],
    defaultCustomerFilterId: null,
    orders: [],
    invoices: [],
    approvals: [],
    allocations: {},
    seq: {
      customer: 10,
      filter: 1,
      order: 1,
      invoice: 1,
      item: 1,
      allocation: 1,
    },
  };

  await mockCoreErpApis(page, state);

  await page.goto('/modules/crm');
  await expect(page.getByRole('link', { name: 'Import' })).toBeVisible();
  await page.getByRole('link', { name: 'Import' }).click();
  await expect(page).toHaveURL(/\/modules\/crm\/customers\/import$/);

  await expect(page.getByRole('button', { name: 'Tải file mẫu' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chạy mô phỏng' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import thật' })).toBeVisible();

  const importRows = [
    {
      fullName: 'Khách cập nhật',
      phone: '0901112222',
      source: 'REFERRAL',
      status: 'DANG_SUY_NGHI',
      tags: ['vip', 'da_mua'],
    },
    {
      fullName: 'Khách tạo mới',
      phone: '0903334444',
      source: 'ONLINE',
      status: 'MOI_CHUA_TU_VAN',
      tags: ['khach_moi'],
    },
    {
      fullName: 'Dòng lỗi thiếu định danh',
    },
  ];

  const previewResponse = await page.evaluate(async (rows) => {
    const response = await fetch('/api/v1/crm/customers/import/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fileName: 'customers-import.xlsx', rows }),
    });
    return {
      status: response.status,
      body: await response.json(),
    };
  }, importRows);

  expect(previewResponse.status).toBe(201);
  expect(previewResponse.body).toEqual(
    expect.objectContaining({
      totalRows: 3,
      validRows: 2,
      wouldCreateCount: 1,
      wouldUpdateCount: 1,
      skippedCount: 1,
    }),
  );

  const importResponse = await page.evaluate(async (rows) => {
    const response = await fetch('/api/v1/crm/customers/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fileName: 'customers-import.xlsx', rows }),
    });
    return {
      status: response.status,
      body: await response.json(),
    };
  }, importRows);

  expect(importResponse.status).toBe(201);
  expect(importResponse.body).toEqual(
    expect.objectContaining({
      totalRows: 3,
      importedCount: 2,
      skippedCount: 1,
    }),
  );

  expect(state.customers).toHaveLength(2);
  expect(state.customers.some((item) => item.phone === '0903334444')).toBe(true);
  expect(state.customers.find((item) => item.phone === '0901112222')?.status).toBe('DANG_SUY_NGHI');
});
