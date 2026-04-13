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

export const hrModule: ModuleDefinition = {
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
            label: 'Xóa nhân viên',
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
            label: 'Xóa cấu phần',
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
              { name: 'year', label: 'Năm', type: 'number', integer: true, min: 1900, max: 2100, placeholder: '2026' }
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
              { name: 'month', label: 'Tháng', type: 'number', required: true, integer: true, min: 1, max: 12, placeholder: '3' },
              { name: 'year', label: 'Năm', type: 'number', required: true, integer: true, min: 1900, max: 2100, placeholder: '2026' },
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
            label: 'Xóa bảng lương',
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
            label: 'Xóa tuyển dụng',
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
          { key: 'month', label: 'Tháng', type: 'number', integer: true, min: 1, max: 12, placeholder: 'Tháng', queryParam: 'month' },
          { key: 'year', label: 'Năm', type: 'number', integer: true, min: 1900, max: 2100, placeholder: 'Năm', queryParam: 'year' },
          { key: 'employeeId', label: 'Mã nhân viên', type: 'text', placeholder: 'EMP-0001', queryParam: 'employeeId' }
        ],
        actions: [
          {
            key: 'generate-personal-income-tax-records',
            label: 'Generate kỳ thuế',
            method: 'POST',
            endpoint: '/hr/personal-income-tax/records/generate',
            fields: [
              { name: 'taxMonth', label: 'Tháng', type: 'number', required: true, integer: true, min: 1, max: 12, defaultValue: 3 },
              { name: 'taxYear', label: 'Năm', type: 'number', required: true, integer: true, min: 1900, max: 2100, defaultValue: 2026 },
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
              { name: 'taxMonth', label: 'Tháng', type: 'number', required: true, integer: true, min: 1, max: 12 },
              { name: 'taxYear', label: 'Năm', type: 'number', required: true, integer: true, min: 1900, max: 2100 },
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
              { name: 'taxMonth', label: 'Tháng', type: 'number', integer: true, min: 1, max: 12 },
              { name: 'taxYear', label: 'Năm', type: 'number', integer: true, min: 1900, max: 2100 },
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
  };
