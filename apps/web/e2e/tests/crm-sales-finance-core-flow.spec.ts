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

type MockState = {
  customers: Customer[];
  orders: SalesOrder[];
  invoices: FinanceInvoice[];
  approvals: Array<{ id: string; targetId: string; status: string; createdAt: string }>;
  allocations: Record<string, PaymentAllocation[]>;
  seq: {
    customer: number;
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
        status: 'ACTIVE',
        tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
        updatedAt: now
      };
      state.customers.unshift(customer);
      return json(route, { deduplicated: false, message: 'Đã tạo khách hàng mới.', customer }, 201);
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
      customer.status = 'ARCHIVED';
      customer.updatedAt = new Date().toISOString();
      return json(route, { ok: true });
    }

    if (method === 'GET' && path === '/api/v1/sales/orders') {
      return json(route, { items: state.orders });
    }

    if (method === 'GET' && path === '/api/v1/sales/approvals') {
      return json(route, state.approvals);
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
    orders: [],
    invoices: [],
    approvals: [],
    allocations: {},
    seq: {
      customer: 1,
      order: 1,
      invoice: 1,
      item: 1,
      allocation: 1
    }
  };

  await mockCoreErpApis(page, state);

  await page.goto('/modules/crm');
  await page.getByRole('button', { name: 'Khách hàng' }).click();
  await page.getByPlaceholder('Nguyễn Văn A').fill('Khách Lẻ A');
  await page.getByPlaceholder('09xxxxxxxx').fill('0912345678');
  await page.getByPlaceholder('customer@example.com').fill('khach-a@example.com');
  await page.locator('.side-panel-container').getByRole('button', { name: /^Tạo khách hàng$/ }).click();
  await expect(page.getByText('Đã tạo khách hàng thành công.')).toBeVisible();
  expect(state.customers).toHaveLength(1);

  await page.goto('/modules/sales');
  await page.getByRole('button', { name: 'Tạo đơn hàng' }).first().click();
  await page.getByPlaceholder('SO-2026-000001').fill('SO-E2E-0001');
  await page.getByPlaceholder('Tên khách hàng').fill('Khách Lẻ A');
  await page.getByPlaceholder('cus_xxx').fill(state.customers[0].id);
  await page.getByPlaceholder('Sản phẩm A').fill('Ao thun dong phuc');
  const lineNumberInputs = page.locator('.side-panel-container input[type="number"]');
  await lineNumberInputs.nth(1).fill('150000');
  await page.locator('.side-panel-container').getByRole('button', { name: /^Tạo đơn hàng$/ }).click();
  await expect(page.getByText('Đã tạo đơn hàng SO-E2E-0001.')).toBeVisible();
  expect(state.orders).toHaveLength(1);

  await page.getByRole('button', { name: 'SO-E2E-0001' }).click();
  await page.locator('.side-panel-container').getByRole('button', { name: 'Phê duyệt đơn' }).click();
  await expect(page.getByText('Đơn hàng SO-E2E-0001 đã được phê duyệt.')).toBeVisible();
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
        status: 'ACTIVE',
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
        status: 'ACTIVE',
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
    approvals: [],
    allocations: {},
    seq: {
      customer: 3,
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

  await page.goto('/modules/crm');
  const crmOverlay = page.locator('.side-panel-overlay');
  if (await crmOverlay.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await crmOverlay.waitFor({ state: 'hidden' }).catch(() => {});
  }
  await expect(page.getByRole('button', { name: 'Khách bulk 1' })).toBeVisible();
  await checkAllVisibleRows();
  await page.getByRole('button', { name: 'Set INACTIVE' }).click();
  await expect(page.locator('.finance-alert-success')).toContainText('Set trạng thái INACTIVE: thành công 2/2.');
  expect(state.customers.every((item) => item.status === 'INACTIVE')).toBe(true);

  await page.goto('/modules/sales');
  await expect(page.getByRole('button', { name: 'SO-BULK-001' })).toBeVisible();
  await checkAllVisibleRows();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.locator('.finance-alert-success')).toContainText('Duyệt đơn hàng: thành công 2/2.');
  expect(state.orders.every((item) => item.status === 'APPROVED')).toBe(true);

  page.once('dialog', (dialog) => dialog.accept());
  await checkAllVisibleRows();
  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page.locator('.finance-alert-success')).toContainText('Lưu trữ đơn hàng: thành công 2/2.');
  expect(state.orders.every((item) => item.status === 'ARCHIVED')).toBe(true);

  await page.goto('/modules/finance');
  await expect(page.getByRole('button', { name: 'INV-BULK-001' })).toBeVisible();
  await checkAllVisibleRows();
  await page.getByRole('button', { name: 'Issue' }).click();
  await expect(page.locator('.finance-alert-success')).toContainText('Phát hành hóa đơn: thành công 2/2.');
  expect(state.invoices.every((item) => item.status === 'PENDING')).toBe(true);

  await checkAllVisibleRows();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.locator('.finance-alert-success')).toContainText('Phê duyệt hóa đơn: thành công 2/2.');
  expect(state.invoices.every((item) => item.status === 'APPROVED')).toBe(true);

  page.once('dialog', (dialog) => dialog.accept());
  await checkAllVisibleRows();
  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page.locator('.finance-alert-success')).toContainText('Lưu trữ hóa đơn: thành công 2/2.');
  expect(state.invoices.every((item) => item.status === 'ARCHIVED')).toBe(true);
});
