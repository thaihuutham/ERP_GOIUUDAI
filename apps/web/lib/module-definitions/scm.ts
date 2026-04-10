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

export const scmModule: ModuleDefinition = {
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
  };
