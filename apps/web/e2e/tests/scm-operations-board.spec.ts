import { expect, test, type Page, type Route } from '@playwright/test';

type Vendor = {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  status: string;
  createdAt: string;
};

type PurchaseOrder = {
  id: string;
  poNo: string;
  vendorId: string;
  totalAmount: number;
  receivedAmount: number;
  lifecycleStatus: string;
  status: string;
  expectedReceiveAt: string;
  createdAt: string;
  vendor: Vendor;
};

type Shipment = {
  id: string;
  shipmentNo: string;
  orderRef: string;
  carrier: string;
  lifecycleStatus: string;
  status: string;
  expectedDeliveryAt: string;
  createdAt: string;
};

type PurchaseReceipt = {
  id: string;
  receiptNo: string;
  receivedAmount: number;
  receivedQty: number;
  receivedAt: string;
};

type ListQuery = {
  q: string;
  limit: number;
  cursor: string | null;
  sortBy: string;
  sortDir: 'asc' | 'desc';
};

type ScmMockState = {
  vendors: Vendor[];
  purchaseOrders: PurchaseOrder[];
  shipments: Shipment[];
  receiptsByPurchaseOrderId: Record<string, PurchaseReceipt[]>;
  poQueries: ListQuery[];
  vendorQueries: ListQuery[];
  shipmentQueries: ListQuery[];
};

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload)
  });
}

function readListQuery(url: URL): ListQuery {
  const rawLimit = Number(url.searchParams.get('limit') ?? 25);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.round(rawLimit)) : 25;
  const sortDir = String(url.searchParams.get('sortDir') ?? 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
  return {
    q: String(url.searchParams.get('q') ?? '').trim().toLowerCase(),
    limit,
    cursor: url.searchParams.get('cursor'),
    sortBy: String(url.searchParams.get('sortBy') ?? 'createdAt').trim() || 'createdAt',
    sortDir
  };
}

function toSortableValue(value: unknown): number | string {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp) && value.includes('T')) {
      return timestamp;
    }
    return value.toLowerCase();
  }

  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}

function compareValues(left: unknown, right: unknown, sortDir: 'asc' | 'desc') {
  const leftValue = toSortableValue(left);
  const rightValue = toSortableValue(right);
  if (leftValue < rightValue) {
    return sortDir === 'asc' ? -1 : 1;
  }
  if (leftValue > rightValue) {
    return sortDir === 'asc' ? 1 : -1;
  }
  return 0;
}

function filterByQuery<T>(
  rows: T[],
  queryText: string,
  fields: Array<(row: T) => string | null | undefined>
) {
  if (!queryText) {
    return rows;
  }

  return rows.filter((row) =>
    fields.some((pick) => {
      const raw = pick(row);
      return String(raw ?? '').toLowerCase().includes(queryText);
    })
  );
}

function sortAndPaginate<T extends { id: string }>(
  rows: T[],
  query: ListQuery,
  sortableFields: string[],
  getSortValue: (row: T, sortBy: string) => unknown
) {
  const normalizedSortBy = sortableFields.includes(query.sortBy) ? query.sortBy : 'createdAt';
  const sorted = [...rows].sort((left, right) => {
    const byField = compareValues(getSortValue(left, normalizedSortBy), getSortValue(right, normalizedSortBy), query.sortDir);
    if (byField !== 0) {
      return byField;
    }
    return compareValues(left.id, right.id, query.sortDir);
  });

  const offset = query.cursor ? Number(query.cursor) : 0;
  const start = Number.isFinite(offset) && offset > 0 ? Math.round(offset) : 0;
  const items = sorted.slice(start, start + query.limit);
  const nextOffset = start + items.length;
  const hasMore = nextOffset < sorted.length;

  return {
    items,
    pageInfo: {
      limit: query.limit,
      hasMore,
      nextCursor: hasMore ? String(nextOffset) : null
    },
    sortMeta: {
      sortBy: normalizedSortBy,
      sortDir: query.sortDir,
      sortableFields
    }
  };
}

function createMockState(): ScmMockState {
  const vendors: Vendor[] = Array.from({ length: 30 }, (_, index) => {
    const serial = String(index + 1).padStart(4, '0');
    return {
      id: `vendor_${serial}`,
      code: `V-${serial}`,
      name: `Vendor ${serial}`,
      phone: `0900${serial}`,
      email: `vendor${serial}@demo.local`,
      status: index % 7 === 0 ? 'INACTIVE' : 'ACTIVE',
      createdAt: `2026-01-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`
    };
  });

  const purchaseOrders: PurchaseOrder[] = Array.from({ length: 30 }, (_, index) => {
    const serial = String(index + 1).padStart(4, '0');
    const vendor = vendors[index % vendors.length];
    return {
      id: `po_${serial}`,
      poNo: `PO-${serial}`,
      vendorId: vendor.id,
      totalAmount: 1000 + index * 100,
      receivedAmount: index % 3 === 0 ? 500 + index * 50 : 0,
      lifecycleStatus: index % 2 === 0 ? 'SUBMITTED' : 'APPROVED',
      status: index % 2 === 0 ? 'PENDING' : 'ACTIVE',
      expectedReceiveAt: `2026-05-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
      createdAt: `2026-03-${String((index % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
      vendor
    };
  });

  const shipments: Shipment[] = Array.from({ length: 30 }, (_, index) => {
    const serial = String(index + 1).padStart(4, '0');
    return {
      id: `shipment_${serial}`,
      shipmentNo: `SHP-${serial}`,
      orderRef: `SO-${serial}`,
      carrier: index % 2 === 0 ? 'VNPOST' : 'GHTK',
      lifecycleStatus: index % 3 === 0 ? 'IN_TRANSIT' : 'PENDING',
      status: index % 3 === 0 ? 'ACTIVE' : 'PENDING',
      expectedDeliveryAt: `2026-06-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
      createdAt: `2026-04-${String((index % 28) + 1).padStart(2, '0')}T08:00:00.000Z`
    };
  });

  return {
    vendors,
    purchaseOrders,
    shipments,
    receiptsByPurchaseOrderId: {
      po_0001: [
        {
          id: 'receipt_0001',
          receiptNo: 'REC-0001',
          receivedAmount: 700,
          receivedQty: 5,
          receivedAt: '2026-04-10T03:00:00.000Z'
        }
      ]
    },
    poQueries: [],
    vendorQueries: [],
    shipmentQueries: []
  };
}

async function mockScmApis(page: Page, state: ScmMockState) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;

    if (method === 'GET' && path === '/api/v1/settings/runtime') {
      return json(route, {
        organization: { companyName: 'ERP Demo' },
        enabledModules: [
          'crm',
          'sales',
          'catalog',
          'hr',
          'finance',
          'scm',
          'assets',
          'projects',
          'workflows',
          'reports',
          'notifications'
        ]
      });
    }

    if (method === 'GET' && path === '/api/v1/settings/permissions/effective') {
      return json(route, { effective: [] });
    }

    if (method === 'GET' && path === '/api/v1/settings/domains/access_security') {
      return json(route, { iamV2: { enabled: false, mode: 'OFF' } });
    }

    if (method === 'GET' && path === '/api/v1/scm/purchase-orders') {
      const query = readListQuery(url);
      state.poQueries.push(query);
      const filtered = filterByQuery(state.purchaseOrders, query.q, [
        (row) => row.poNo,
        (row) => row.vendor.name,
        (row) => row.vendor.code,
        (row) => row.vendorId
      ]);
      return json(
        route,
        sortAndPaginate(
          filtered,
          query,
          ['createdAt', 'poNo', 'vendorId', 'totalAmount', 'receivedAmount', 'lifecycleStatus', 'status', 'expectedReceiveAt', 'id'],
          (row, sortBy) => (sortBy === 'vendorId' ? row.vendor.name : (row as Record<string, unknown>)[sortBy])
        )
      );
    }

    if (method === 'GET' && path === '/api/v1/scm/vendors') {
      const query = readListQuery(url);
      state.vendorQueries.push(query);
      const filtered = filterByQuery(state.vendors, query.q, [
        (row) => row.code,
        (row) => row.name,
        (row) => row.phone,
        (row) => row.email
      ]);
      return json(
        route,
        sortAndPaginate(
          filtered,
          query,
          ['createdAt', 'code', 'name', 'phone', 'email', 'status', 'id'],
          (row, sortBy) => (row as Record<string, unknown>)[sortBy]
        )
      );
    }

    if (method === 'GET' && path === '/api/v1/scm/shipments') {
      const query = readListQuery(url);
      state.shipmentQueries.push(query);
      const filtered = filterByQuery(state.shipments, query.q, [
        (row) => row.shipmentNo,
        (row) => row.orderRef,
        (row) => row.carrier
      ]);
      return json(
        route,
        sortAndPaginate(
          filtered,
          query,
          ['createdAt', 'shipmentNo', 'orderRef', 'carrier', 'lifecycleStatus', 'status', 'expectedDeliveryAt', 'id'],
          (row, sortBy) => (row as Record<string, unknown>)[sortBy]
        )
      );
    }

    if (method === 'GET' && /\/api\/v1\/scm\/purchase-orders\/[^/]+\/receipts$/.test(path)) {
      const purchaseOrderId = path.split('/')[5] ?? '';
      return json(route, state.receiptsByPurchaseOrderId[purchaseOrderId] ?? []);
    }

    return json(route, { ok: true });
  });
}

test.describe('SCM operations board', () => {
  test('renders PO/vendors/shipments tabs with server-driven sort + pagination and PO detail panel', async ({ page }) => {
    const state = createMockState();
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.localStorage.setItem('erp_web_role', 'ADMIN');
    });
    await mockScmApis(page, state);

    await page.goto('/modules/scm');
    await expect(page.getByRole('button', { name: 'Đơn mua hàng (PO)' })).toBeVisible();
    await expect(page.getByRole('button', { name: /PO-\d{4}/ }).first()).toBeVisible();

    await expect.poll(() => state.poQueries.length).toBeGreaterThan(0);
    await expect.poll(() => state.vendorQueries.length).toBeGreaterThan(0);
    await expect.poll(() => state.shipmentQueries.length).toBeGreaterThan(0);
    expect(state.poQueries.at(-1)).toMatchObject({
      sortBy: 'createdAt',
      sortDir: 'desc',
      limit: 25,
      cursor: null
    });

    await page.getByRole('button', { name: /Tổng tiền/ }).click();
    await expect.poll(() => state.poQueries.at(-1)?.sortBy).toBe('totalAmount');
    await expect.poll(() => state.poQueries.at(-1)?.sortDir).toBe('asc');
    await expect(page.getByRole('button', { name: 'PO-0001' })).toBeVisible();

    await page.getByRole('button', { name: 'PO-0001' }).click();
    await expect(page.getByRole('heading', { name: 'Chi tiết đơn mua hàng' })).toBeVisible();
    await expect(page.getByText('REC-0001')).toBeVisible();
    await page.getByRole('button', { name: 'Đóng' }).click();

    await page.getByRole('button', { name: 'Sau' }).click();
    await expect(page.getByText('Trang 2')).toBeVisible();
    await expect.poll(() => state.poQueries.at(-1)?.cursor).toBe('25');

    await page.getByRole('button', { name: 'Nhà cung cấp' }).first().click();
    await expect(page.getByText(/V-\d{4}/).first()).toBeVisible();
    await page.getByRole('button', { name: /Tên nhà cung cấp/ }).click();
    await expect.poll(() => state.vendorQueries.at(-1)?.sortBy).toBe('name');
    await expect.poll(() => state.vendorQueries.at(-1)?.sortDir).toBe('asc');

    await page.getByRole('button', { name: 'Giao hàng (Shipments)' }).click();
    await expect(page.getByText(/SHP-\d{4}/).first()).toBeVisible();
    await page.getByRole('button', { name: /Đơn vị vận chuyển/ }).click();
    await expect.poll(() => state.shipmentQueries.at(-1)?.sortBy).toBe('carrier');
    await expect.poll(() => state.shipmentQueries.at(-1)?.sortDir).toBe('asc');
  });
});
