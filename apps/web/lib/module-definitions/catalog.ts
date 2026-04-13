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

export const catalogModule: ModuleDefinition = {
    key: 'catalog',
    title: 'Danh mục',
    summary: 'Board danh mục chuyên sâu: chuẩn hóa sản phẩm, chính sách giá và vòng đời xóa.',
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
            label: 'Gồm bản ghi đã xóa',
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
            label: 'Xóa sản phẩm',
            method: 'POST',
            endpoint: '/catalog/products/:id/archive',
            fields: [
              { name: 'id', label: 'Mã sản phẩm', required: true },
              {
                name: 'reason',
                label: 'Lý do xóa',
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
  };
