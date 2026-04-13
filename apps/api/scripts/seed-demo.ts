import {
  CustomerAssignmentAction,
  CustomerCareStatus,
  EmploymentType,
  GenericStatus,
  PayrollComponentType,
  PayrollFormulaType,
  Prisma,
  PrismaClient,
  UserRole
} from '@prisma/client';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://erp:erp@localhost:55432/erp_retail';
const TENANT_ID = process.env.DEFAULT_TENANT_ID ?? 'GOIUUDAI';
const TENANT_CODE = `TENANT_${TENANT_ID}`;
const DEMO = 'DMO';

const prisma = new PrismaClient({
  datasourceUrl: DATABASE_URL
});

type WithTenant = { tenant_Id: string };

const COUNTS = {
  departments: 12,
  positions: 48,
  workShifts: 12,
  leavePolicies: 12,
  employees: 120,
  employeeContracts: 120,
  payrollComponents: 16,
  hrEvents: 240,
  users: 120,
  customers: 120,
  products: 120,
  vendors: 120,
  projects: 100,
  assets: 120,
  orders: 140,
  purchaseOrders: 120,
  invoices: 140,
  interactions: 240,
  paymentRequests: 120,
  customerMergeLogs: 20,
  attendance: 240,
  leaveRequests: 120,
  payrolls: 120,
  recruitments: 120,
  trainings: 120,
  performances: 120,
  benefits: 120,
  personalIncomeTaxProfiles: 120,
  personalIncomeTaxRecords: 120,
  goals: 120,
  accounts: 100,
  journalEntries: 120,
  budgetPlans: 120,
  shipments: 120,
  distributions: 120,
  demandForecasts: 120,
  supplyChainRisks: 120,
  assetAllocations: 120,
  projectTasks: 220,
  projectResources: 120,
  projectBudgets: 120,
  timeEntries: 240,
  workflowDefinitions: 100,
  workflowInstances: 120,
  approvals: 120,
  reports: 120,
  notifications: 150
} as const;

function mulberry32(seed: number) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(20260328);

function pick<T>(items: T[]): T {
  return items[Math.floor(random() * items.length)];
}

function intBetween(min: number, max: number) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function decimal(value: number) {
  return new Prisma.Decimal(value.toFixed(2));
}

function code(prefix: string, index: number, width = 4) {
  return `${prefix}${String(index).padStart(width, '0')}`;
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function randomPastDate(maxDays = 365) {
  const date = daysAgo(intBetween(1, maxDays));
  date.setHours(intBetween(7, 21), intBetween(0, 59), 0, 0);
  return date;
}

function randomFutureDate(from: Date, maxDays = 30) {
  const date = new Date(from);
  date.setDate(date.getDate() + intBetween(1, maxDays));
  date.setHours(intBetween(8, 18), intBetween(0, 59), 0, 0);
  return date;
}

function demoPhone(index: number) {
  return `0${String(900000000 + index).slice(-9)}`;
}

function demoEmail(prefix: string, index: number) {
  return `${prefix}.${String(index).padStart(4, '0')}@demo-erp.local`;
}

async function ensureTenant() {
  await prisma.tenant.upsert({
    where: { tenant_Id: TENANT_ID },
    update: {
      code: TENANT_CODE,
      name: `Tenant Demo ${TENANT_ID}`,
      status: GenericStatus.ACTIVE
    },
    create: {
      tenant_Id: TENANT_ID,
      code: TENANT_CODE,
      name: `Tenant Demo ${TENANT_ID}`,
      status: GenericStatus.ACTIVE
    }
  });
}

async function resetTenantData(tenantId: string) {
  const where: WithTenant = { tenant_Id: tenantId };

  // ── E-Learning (children → parents) ──
  await prisma.dailyQuizSession.deleteMany({ where });
  await prisma.elearningComment.deleteMany({ where });
  await prisma.elearningCertificate.deleteMany({ where });
  await prisma.elearningLessonProgress.deleteMany({ where });
  await prisma.elearningEnrollment.deleteMany({ where });
  await prisma.elearningExamAttempt.deleteMany({ where });
  await prisma.elearningExam.deleteMany({ where });
  await prisma.elearningLessonQuestion.deleteMany({ where });
  await prisma.elearningQuestionOption.deleteMany({ where });
  await prisma.elearningQuestion.deleteMany({ where });
  await prisma.elearningLesson.deleteMany({ where });
  await prisma.elearningSection.deleteMany({ where });
  await prisma.elearningCourse.deleteMany({ where });
  await prisma.elearningQuestionCategory.deleteMany({ where });

  // ── CRM Distribution (phải xóa trước Customer) ──
  await prisma.customerAssignmentLog.deleteMany({ where });
  await prisma.customerRotationBlacklist.deleteMany({ where });

  await prisma.hrGoal.deleteMany({ where });
  await prisma.personalIncomeTaxRecord.deleteMany({ where });
  await prisma.personalIncomeTaxProfile.deleteMany({ where });
  await prisma.hrEvent.deleteMany({ where });
  await prisma.payrollLineItem.deleteMany({ where });
  await prisma.customerMergeLog.deleteMany({ where });
  await prisma.paymentRequest.deleteMany({ where });
  await prisma.customerInteraction.deleteMany({ where });
  await prisma.orderItem.deleteMany({ where });
  await prisma.order.deleteMany({ where });
  await prisma.approval.deleteMany({ where });
  await prisma.workflowActionLog.deleteMany({ where });
  await prisma.workflowInstance.deleteMany({ where });
  await prisma.workflowDefinition.deleteMany({ where });
  await prisma.timeEntry.deleteMany({ where });
  await prisma.projectBudget.deleteMany({ where });
  await prisma.projectResource.deleteMany({ where });
  await prisma.projectTask.deleteMany({ where });
  await prisma.project.deleteMany({ where });
  await prisma.assetAllocation.deleteMany({ where });
  await prisma.asset.deleteMany({ where });
  await prisma.supplyChainRisk.deleteMany({ where });
  await prisma.demandForecast.deleteMany({ where });
  await prisma.distribution.deleteMany({ where });
  await prisma.shipment.deleteMany({ where });
  await prisma.purchaseOrder.deleteMany({ where });
  await prisma.vendor.deleteMany({ where });
  await prisma.budgetPlan.deleteMany({ where });
  await prisma.journalEntry.deleteMany({ where });
  await prisma.account.deleteMany({ where });
  await prisma.invoice.deleteMany({ where });
  await prisma.payroll.deleteMany({ where });
  await prisma.employeeContract.deleteMany({ where });
  await prisma.leaveRequest.deleteMany({ where });
  await prisma.leavePolicy.deleteMany({ where });
  await prisma.payrollComponent.deleteMany({ where });
  await prisma.attendance.deleteMany({ where });
  await prisma.workShift.deleteMany({ where });
  await prisma.recruitment.deleteMany({ where });
  await prisma.training.deleteMany({ where });
  await prisma.performance.deleteMany({ where });
  await prisma.benefit.deleteMany({ where });
  await prisma.report.deleteMany({ where });
  await prisma.notificationDispatch.deleteMany({ where });
  await prisma.notification.deleteMany({ where });
  await prisma.setting.deleteMany({ where });
  await prisma.user.deleteMany({ where });
  await prisma.employee.deleteMany({ where });
  await prisma.position.deleteMany({ where });
  await prisma.department.deleteMany({ where });
  await prisma.product.deleteMany({ where });
  await prisma.customer.deleteMany({ where });
}

async function seed() {
  const defaultQuestionCategories = [
    { code: 'GENERAL', label: 'Chung', color: '#6B7280', sortOrder: 0 },
    { code: 'SALES', label: 'Kinh doanh', color: '#3B82F6', sortOrder: 1 },
    { code: 'HR', label: 'Nhân sự', color: '#8B5CF6', sortOrder: 2 },
    { code: 'FINANCE', label: 'Tài chính', color: '#10B981', sortOrder: 3 },
    { code: 'SCM', label: 'Chuỗi cung ứng', color: '#F59E0B', sortOrder: 4 },
    { code: 'COMPLIANCE', label: 'Tuân thủ', color: '#EF4444', sortOrder: 5 },
    { code: 'ONBOARDING', label: 'Onboarding', color: '#EC4899', sortOrder: 6 }
  ];
  const departments = ['Kinh doanh', 'Marketing', 'Kho vận', 'Kế toán', 'Nhân sự', 'Vận hành'];
  const positions = ['Nhân viên', 'Trưởng nhóm', 'Chuyên viên', 'Giám sát'];
  const customerStages = ['MOI', 'DA_TU_VAN', 'QUAN_TAM', 'DA_MUA', 'KHONG_TIEP_TUC'];
  const customerCareStatuses = [
    CustomerCareStatus.MOI_CHUA_TU_VAN,
    CustomerCareStatus.DANG_SUY_NGHI,
    CustomerCareStatus.DONG_Y_CHUYEN_THANH_KH,
    CustomerCareStatus.KH_TU_CHOI,
    CustomerCareStatus.KH_DA_MUA_BEN_KHAC,
    CustomerCareStatus.NGUOI_NHA_LAM_THUE_BAO,
    CustomerCareStatus.KHONG_NGHE_MAY_LAN_1,
    CustomerCareStatus.KHONG_NGHE_MAY_LAN_2,
    CustomerCareStatus.SAI_SO_KHONG_TON_TAI_BO_QUA_XOA
  ];
  const customerSources = ['Zalo', 'Facebook', 'Giới thiệu', 'Cửa hàng', 'Website'];
  const customerSegments = ['Mới', 'Thân thiết', 'VIP', 'Doanh nghiệp'];
  const productTypes = ['PRODUCT', 'SERVICE'];
  const interactionTypes = ['TU_VAN', 'CHAM_SOC_SAU_BAN', 'NHAC_THANH_TOAN', 'KIEU_NAI'];
  const interactionChannels = ['ZALO', 'CALL', 'EMAIL', 'OFFLINE'];
  const interactionResultTags = ['quan_tam', 'can_goi_lai', 'da_chot', 'tam_dung'];
  const orderStatuses = [GenericStatus.APPROVED, GenericStatus.PENDING, GenericStatus.REJECTED];
  const approvalStatuses = [GenericStatus.PENDING, GenericStatus.APPROVED, GenericStatus.REJECTED];
  const leaveTypes = ['phep_nam', 'khong_luong', 'om_dau'];
  const recruitmentStages = ['SANG_LOC', 'PHONG_VAN', 'DE_XUAT', 'NHAN_VIEC'];
  const benefitTypes = ['BAO_HIEM', 'AN_TRUA', 'DI_LAI', 'THUONG'];
  const accountTypes = ['TAI_SAN', 'NO_PHAI_TRA', 'DOANH_THU', 'CHI_PHI'];
  const modules = ['crm', 'sales', 'catalog', 'hr', 'finance', 'scm', 'assets', 'projects', 'workflows', 'reports', 'settings', 'notifications'];
  const forecastPeriods = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
  const distributionDestinations = ['Kho Hà Nội', 'Kho Đà Nẵng', 'Kho Hồ Chí Minh', 'Cửa hàng Thủ Đức', 'Cửa hàng Bình Thạnh'];
  const riskSeverities = ['thap', 'trung_binh', 'cao'];
  const workflowTargets = ['ORDER', 'INVOICE', 'PROJECT'];
  const workflowSteps = ['TiepNhan', 'KiemTra', 'PheDuyet', 'HoanTat'];
  const reportTypes = ['doanh_thu', 'nhan_su', 'tai_chinh', 'ton_kho', 'du_an'];
  const runtimeEnabledModules = modules.filter((moduleKey) => moduleKey !== 'settings');
  const employmentTypes = [EmploymentType.FULL_TIME, EmploymentType.PART_TIME, EmploymentType.CONTRACT, EmploymentType.INTERN];
  const contractTypes = ['XAC_DINH_THOI_HAN', 'KHONG_XAC_DINH_THOI_HAN', 'THU_VIEC'];
  const shiftTemplates = [
    { name: 'Ca Hành chính', startTime: '08:30', endTime: '17:30', breakMinutes: 60 },
    { name: 'Ca Sáng', startTime: '07:00', endTime: '15:00', breakMinutes: 45 },
    { name: 'Ca Chiều', startTime: '13:00', endTime: '21:00', breakMinutes: 45 },
    { name: 'Ca Kho Vận', startTime: '06:30', endTime: '14:30', breakMinutes: 30 }
  ];
  const leavePolicyTemplates = [
    { name: 'Nghỉ phép năm', leaveType: 'phep_nam', isPaid: true, annualQuotaDays: 12, maxConsecutiveDays: 5 },
    { name: 'Nghỉ ốm', leaveType: 'om_dau', isPaid: true, annualQuotaDays: 8, maxConsecutiveDays: 7 },
    { name: 'Nghỉ không lương', leaveType: 'khong_luong', isPaid: false, annualQuotaDays: 30, maxConsecutiveDays: 15 },
    { name: 'Nghỉ việc riêng', leaveType: 'viec_rieng', isPaid: true, annualQuotaDays: 3, maxConsecutiveDays: 3 }
  ];
  const payrollComponentTemplates = [
    { code: 'PC_AN_TRUA', name: 'Phụ cấp ăn trưa', componentType: PayrollComponentType.EARNING, formulaType: PayrollFormulaType.FIXED, defaultValue: 700000, isTaxable: false },
    { code: 'PC_DI_LAI', name: 'Phụ cấp đi lại', componentType: PayrollComponentType.EARNING, formulaType: PayrollFormulaType.FIXED, defaultValue: 500000, isTaxable: false },
    { code: 'BHXH_NLD', name: 'Khấu trừ BHXH NLĐ', componentType: PayrollComponentType.DEDUCTION, formulaType: PayrollFormulaType.PERCENT_BASE, defaultValue: 8, isTaxable: false },
    { code: 'BHYT_NLD', name: 'Khấu trừ BHYT NLĐ', componentType: PayrollComponentType.DEDUCTION, formulaType: PayrollFormulaType.PERCENT_BASE, defaultValue: 1.5, isTaxable: false }
  ];

  await ensureTenant();
  await resetTenantData(TENANT_ID);
  await prisma.elearningQuestionCategory.createMany({
    data: defaultQuestionCategories.map((category) => ({
      tenant_Id: TENANT_ID,
      code: category.code,
      label: category.label,
      color: category.color,
      sortOrder: category.sortOrder
    })),
    skipDuplicates: true
  });

  const departmentRows = Array.from({ length: COUNTS.departments }, (_, idx) => {
    const i = idx + 1;
    const name = departments[idx % departments.length];
    return {
      tenant_Id: TENANT_ID,
      code: code(`${DEMO}-DEP-`, i, 3),
      name: `${name} ${Math.floor(idx / departments.length) + 1}`,
      description: `Phòng ban demo ${name} ${i}`,
      status: i % 7 === 0 ? GenericStatus.INACTIVE : GenericStatus.ACTIVE,
      createdAt: randomPastDate(420),
      updatedAt: new Date()
    };
  });
  await prisma.department.createMany({ data: departmentRows });
  const departmentEntities = await prisma.department.findMany({
    where: { tenant_Id: TENANT_ID, code: { startsWith: `${DEMO}-DEP-` } },
    orderBy: { code: 'asc' }
  });

  const positionRows = Array.from({ length: COUNTS.positions }, (_, idx) => {
    const i = idx + 1;
    const department = departmentEntities[idx % departmentEntities.length];
    const title = positions[idx % positions.length];
    return {
      tenant_Id: TENANT_ID,
      code: code(`${DEMO}-POS-`, i, 3),
      title: `${title} ${Math.floor(idx / positions.length) + 1}`,
      departmentId: department?.id ?? null,
      level: pick(['L1', 'L2', 'L3', 'L4']),
      description: `Chức danh demo ${title} ${i}`,
      status: i % 9 === 0 ? GenericStatus.INACTIVE : GenericStatus.ACTIVE,
      createdAt: randomPastDate(360),
      updatedAt: new Date()
    };
  });
  await prisma.position.createMany({ data: positionRows });
  const positionEntities = await prisma.position.findMany({
    where: { tenant_Id: TENANT_ID, code: { startsWith: `${DEMO}-POS-` } },
    orderBy: { code: 'asc' }
  });

  const workShiftRows = Array.from({ length: COUNTS.workShifts }, (_, idx) => {
    const i = idx + 1;
    const template = shiftTemplates[idx % shiftTemplates.length];
    return {
      tenant_Id: TENANT_ID,
      code: code(`${DEMO}-SFT-`, i, 3),
      name: `${template.name} ${Math.floor(idx / shiftTemplates.length) + 1}`,
      startTime: template.startTime,
      endTime: template.endTime,
      breakMinutes: template.breakMinutes,
      overtimeThresholdMinutes: intBetween(20, 60),
      status: i % 8 === 0 ? GenericStatus.INACTIVE : GenericStatus.ACTIVE,
      createdAt: randomPastDate(360),
      updatedAt: new Date()
    };
  });
  await prisma.workShift.createMany({ data: workShiftRows });
  const workShiftEntities = await prisma.workShift.findMany({
    where: { tenant_Id: TENANT_ID, code: { startsWith: `${DEMO}-SFT-` } },
    orderBy: { code: 'asc' }
  });

  const leavePolicyRows = Array.from({ length: COUNTS.leavePolicies }, (_, idx) => {
    const i = idx + 1;
    const template = leavePolicyTemplates[idx % leavePolicyTemplates.length];
    return {
      tenant_Id: TENANT_ID,
      code: code(`${DEMO}-LP-`, i, 3),
      name: `${template.name} ${Math.floor(idx / leavePolicyTemplates.length) + 1}`,
      leaveType: template.leaveType,
      isPaid: template.isPaid,
      annualQuotaDays: decimal(template.annualQuotaDays),
      carryOverLimitDays: decimal(intBetween(0, 5)),
      maxConsecutiveDays: template.maxConsecutiveDays,
      requiresAttachment: template.leaveType === 'om_dau',
      status: i % 10 === 0 ? GenericStatus.INACTIVE : GenericStatus.ACTIVE,
      createdAt: randomPastDate(360),
      updatedAt: new Date()
    };
  });
  await prisma.leavePolicy.createMany({ data: leavePolicyRows });
  const leavePolicies = await prisma.leavePolicy.findMany({
    where: { tenant_Id: TENANT_ID, code: { startsWith: `${DEMO}-LP-` } },
    orderBy: { code: 'asc' }
  });

  const payrollComponentRows = Array.from({ length: COUNTS.payrollComponents }, (_, idx) => {
    const i = idx + 1;
    const template = payrollComponentTemplates[idx % payrollComponentTemplates.length];
    return {
      tenant_Id: TENANT_ID,
      code: `${template.code}_${String(i).padStart(2, '0')}`,
      name: `${template.name} ${Math.floor(idx / payrollComponentTemplates.length) + 1}`,
      componentType: template.componentType,
      formulaType: template.formulaType,
      defaultValue: decimal(template.defaultValue),
      isTaxable: template.isTaxable,
      status: i % 11 === 0 ? GenericStatus.INACTIVE : GenericStatus.ACTIVE,
      note: 'Seed demo payroll component',
      createdAt: randomPastDate(360),
      updatedAt: new Date()
    };
  });
  await prisma.payrollComponent.createMany({ data: payrollComponentRows });

  const employeeRows = Array.from({ length: COUNTS.employees }, (_, idx) => {
    const i = idx + 1;
    const baseSalary = intBetween(8_000_000, 35_000_000);
    const department = departmentEntities[idx % departmentEntities.length];
    const position = positionEntities[idx % positionEntities.length];
    const workShift = workShiftEntities[idx % workShiftEntities.length];
    return {
      tenant_Id: TENANT_ID,
      code: code(`${DEMO}-EMP-`, i, 4),
      fullName: `Nhân sự Demo ${i}`,
      email: demoEmail('employee', i),
      phone: demoPhone(1_000 + i),
      department: department?.name ?? pick(departments),
      departmentId: department?.id ?? null,
      position: position?.title ?? pick(positions),
      positionId: position?.id ?? null,
      workShiftId: workShift?.id ?? null,
      joinDate: randomPastDate(800),
      employmentType: pick(employmentTypes),
      baseSalary: decimal(baseSalary),
      status: i % 19 === 0 ? GenericStatus.INACTIVE : GenericStatus.ACTIVE,
      createdAt: randomPastDate(420),
      updatedAt: new Date()
    };
  });
  await prisma.employee.createMany({ data: employeeRows });
  const employees = await prisma.employee.findMany({
    where: { tenant_Id: TENANT_ID, code: { startsWith: `${DEMO}-EMP-` } },
    orderBy: { code: 'asc' }
  });

  const contractRows = Array.from({ length: COUNTS.employeeContracts }, (_, idx) => {
    const i = idx + 1;
    const employee = employees[idx % employees.length];
    const startDate = randomPastDate(600);
    const hasEndDate = i % 4 === 0;
    const status = hasEndDate ? pick([GenericStatus.INACTIVE, GenericStatus.APPROVED]) : GenericStatus.ACTIVE;
    return {
      tenant_Id: TENANT_ID,
      employeeId: employee.id,
      contractNo: code(`${DEMO}-CTR-`, i, 5),
      contractType: pick(contractTypes),
      startDate,
      endDate: hasEndDate ? randomFutureDate(startDate, 360) : null,
      baseSalary: decimal(intBetween(8_500_000, 38_000_000)),
      allowance: decimal(intBetween(0, 3_000_000)),
      insuranceSalary: decimal(intBetween(5_000_000, 18_000_000)),
      status,
      note: `Hợp đồng demo ${i}`,
      createdAt: randomPastDate(620),
      updatedAt: new Date()
    };
  });
  await prisma.employeeContract.createMany({ data: contractRows });

  const userRows = Array.from({ length: COUNTS.users }, (_, idx) => {
    const i = idx + 1;
    const employee = employees[idx % employees.length];
    let role = UserRole.USER;
    if (i === 1) role = UserRole.ADMIN;

    return {
      tenant_Id: TENANT_ID,
      email: demoEmail('user', i),
      passwordHash: 'demo_password_hash',
      role,
      employeeId: employee?.id ?? null,
      createdAt: randomPastDate(420),
      updatedAt: new Date()
    };
  });
  await prisma.user.createMany({ data: userRows });
  const users = await prisma.user.findMany({
    where: { tenant_Id: TENANT_ID, email: { startsWith: 'user.' } },
    orderBy: { email: 'asc' }
  });
  const approvers = users.filter((user) => user.role === UserRole.ADMIN || user.role === UserRole.USER);

  // ── Nhân viên sales (dùng cho gán owner) ──
  const salesDeptIds = departmentEntities
    .filter((d) => d.name.includes('Kinh doanh'))
    .map((d) => d.id);
  const salesEmployees = employees.filter(
    (e) => e.status === GenericStatus.ACTIVE && salesDeptIds.includes(e.departmentId ?? '')
  );
  const activeSalesStaff = salesEmployees.length > 0 ? salesEmployees : employees.filter((e) => e.status === GenericStatus.ACTIVE).slice(0, 20);

  const customerRows = Array.from({ length: COUNTS.customers }, (_, idx) => {
    const i = idx + 1;
    const phone = demoPhone(i);
    const email = demoEmail('customer', i).toLowerCase();
    const stage = pick(customerStages);
    const tags = ['demo', stage.toLowerCase(), pick(['ban_le', 'vip', 'online', 'tai_cua_hang'])];

    // Pool ownership rule:
    // - KH 1-30: pool (ownerStaffId=null, status=MOI_CHUA_TU_VAN) → test chia tự động
    // - KH 31-60: gán cho NV sales cụ thể → test reclaim/rotation
    // - KH 61-120: gán ngẫu nhiên → test thống kê
    let ownerStaffId: string | null = null;
    let customerStatus: CustomerCareStatus;

    if (i <= 30) {
      // Pool customers — chờ chia
      ownerStaffId = null;
      customerStatus = CustomerCareStatus.MOI_CHUA_TU_VAN;
    } else if (i <= 60) {
      // Gán cho NV sales — test pending/reclaim
      ownerStaffId = activeSalesStaff[idx % activeSalesStaff.length].id;
      customerStatus = pick([
        CustomerCareStatus.MOI_CHUA_TU_VAN,
        CustomerCareStatus.DANG_SUY_NGHI,
        CustomerCareStatus.KH_TU_CHOI,
        CustomerCareStatus.KHONG_NGHE_MAY_LAN_1
      ]);
    } else {
      // Gán ngẫu nhiên
      ownerStaffId = pick(activeSalesStaff).id;
      customerStatus = pick(customerCareStatuses);
    }

    return {
      tenant_Id: TENANT_ID,
      code: code(`${DEMO}-CUS-`, i, 4),
      fullName: `Khách hàng Demo ${i}`,
      phone,
      phoneNormalized: phone,
      email,
      emailNormalized: email,
      tags: Array.from(new Set(tags)),
      customerStage: stage,
      ownerStaffId,
      consentStatus: pick(['DONG_Y', 'CHUA_XAC_NHAN', 'TU_CHOI']),
      segment: pick(customerSegments),
      source: pick(customerSources),
      totalOrders: 0,
      totalSpent: decimal(0),
      status: customerStatus,
      createdAt: randomPastDate(420),
      updatedAt: new Date()
    };
  });
  await prisma.customer.createMany({ data: customerRows });
  const customers = await prisma.customer.findMany({
    where: { tenant_Id: TENANT_ID, code: { startsWith: `${DEMO}-CUS-` } },
    orderBy: { code: 'asc' }
  });

  const productRows = Array.from({ length: COUNTS.products }, (_, idx) => {
    const i = idx + 1;
    const type = pick(productTypes);
    const price = type === 'SERVICE' ? intBetween(300_000, 4_500_000) : intBetween(90_000, 25_000_000);
    return {
      tenant_Id: TENANT_ID,
      sku: code(`${DEMO}-SKU-`, i, 4),
      name: `${type === 'SERVICE' ? 'Dịch vụ' : 'Sản phẩm'} Demo ${i}`,
      productType: type,
      unitPrice: decimal(price),
      status: i % 37 === 0 ? GenericStatus.INACTIVE : GenericStatus.ACTIVE,
      createdAt: randomPastDate(420),
      updatedAt: new Date()
    };
  });
  await prisma.product.createMany({ data: productRows });
  const products = await prisma.product.findMany({
    where: { tenant_Id: TENANT_ID, sku: { startsWith: `${DEMO}-SKU-` } },
    orderBy: { sku: 'asc' }
  });

  const vendorRows = Array.from({ length: COUNTS.vendors }, (_, idx) => {
    const i = idx + 1;
    return {
      tenant_Id: TENANT_ID,
      code: code(`${DEMO}-VND-`, i, 4),
      name: `Nhà cung cấp Demo ${i}`,
      phone: demoPhone(5_000 + i),
      email: demoEmail('vendor', i),
      status: i % 24 === 0 ? GenericStatus.INACTIVE : GenericStatus.ACTIVE,
      createdAt: randomPastDate(360),
      updatedAt: new Date()
    };
  });
  await prisma.vendor.createMany({ data: vendorRows });
  const vendors = await prisma.vendor.findMany({
    where: { tenant_Id: TENANT_ID, code: { startsWith: `${DEMO}-VND-` } },
    orderBy: { code: 'asc' }
  });

  const projectRows = Array.from({ length: COUNTS.projects }, (_, idx) => {
    const i = idx + 1;
    const startAt = randomPastDate(240);
    const endAt = randomFutureDate(startAt, 120);
    return {
      tenant_Id: TENANT_ID,
      code: code(`${DEMO}-PRJ-`, i, 4),
      name: `Dự án Demo ${i}`,
      description: `Mô tả dự án demo ${i}`,
      status: i % 9 === 0 ? GenericStatus.APPROVED : GenericStatus.PENDING,
      startAt,
      endAt,
      createdAt: randomPastDate(260),
      updatedAt: new Date()
    };
  });
  await prisma.project.createMany({ data: projectRows });
  const projects = await prisma.project.findMany({
    where: { tenant_Id: TENANT_ID, code: { startsWith: `${DEMO}-PRJ-` } },
    orderBy: { code: 'asc' }
  });

  const assetRows = Array.from({ length: COUNTS.assets }, (_, idx) => {
    const i = idx + 1;
    return {
      tenant_Id: TENANT_ID,
      assetCode: code(`${DEMO}-AST-`, i, 4),
      name: `Tài sản Demo ${i}`,
      category: pick(['CNTT', 'Kho vận', 'Văn phòng', 'POS']),
      purchaseAt: randomPastDate(500),
      value: decimal(intBetween(1_200_000, 45_000_000)),
      status: i % 29 === 0 ? GenericStatus.INACTIVE : GenericStatus.ACTIVE,
      createdAt: randomPastDate(520),
      updatedAt: new Date()
    };
  });
  await prisma.asset.createMany({ data: assetRows });
  const assets = await prisma.asset.findMany({
    where: { tenant_Id: TENANT_ID, assetCode: { startsWith: `${DEMO}-AST-` } },
    orderBy: { assetCode: 'asc' }
  });

  const workflowDefinitionRows = Array.from({ length: COUNTS.workflowDefinitions }, (_, idx) => {
    const i = idx + 1;
    const module = i === 1 ? 'sales' : pick(modules);
    const codeValue = i === 1 ? 'SALES_ORDER_EDIT' : code(`${DEMO}-WF-`, i, 4);
    const baseGraph = {
      initialStep: 'approval',
      steps: [
        {
          key: 'approval',
          approvalMode: 'ALL',
          slaHours: 24,
          approvers: [
            {
              type: 'ROLE',
              role: module === 'sales' ? 'USER' : 'ADMIN'
            }
          ],
          transitions: [
            { action: 'APPROVE', terminalStatus: 'APPROVED' },
            { action: 'REJECT', terminalStatus: 'REJECTED' }
          ]
        }
      ]
    };
    return {
      tenant_Id: TENANT_ID,
      code: codeValue,
      name: `Quy trình Demo ${i}`,
      module,
      version: intBetween(1, 3),
      definitionJson: baseGraph,
      status: i % 10 === 0 ? GenericStatus.INACTIVE : GenericStatus.ACTIVE,
      createdAt: randomPastDate(180),
      updatedAt: new Date()
    };
  });
  await prisma.workflowDefinition.createMany({ data: workflowDefinitionRows });
  const workflowDefinitions = await prisma.workflowDefinition.findMany({
    where: { tenant_Id: TENANT_ID, code: { startsWith: `${DEMO}-WF-` } },
    orderBy: { code: 'asc' }
  });

  const attendanceRows = Array.from({ length: COUNTS.attendance }, (_, idx) => {
    const employee = employees[idx % employees.length];
    const workShift = workShiftEntities[idx % workShiftEntities.length];
    const workDate = randomPastDate(120);
    const [shiftStartHour, shiftStartMinute] = (workShift?.startTime ?? '08:30').split(':').map(Number);
    const [shiftEndHour, shiftEndMinute] = (workShift?.endTime ?? '17:30').split(':').map(Number);
    const scheduledStartAt = new Date(workDate);
    scheduledStartAt.setHours(shiftStartHour, shiftStartMinute, 0, 0);
    const scheduledEndAt = new Date(workDate);
    scheduledEndAt.setHours(shiftEndHour, shiftEndMinute, 0, 0);
    if (scheduledEndAt <= scheduledStartAt) {
      scheduledEndAt.setDate(scheduledEndAt.getDate() + 1);
    }

    const checkInAt = new Date(scheduledStartAt);
    checkInAt.setMinutes(checkInAt.getMinutes() + intBetween(-20, 40));
    const checkOutAt = new Date(workDate);
    checkOutAt.setTime(scheduledEndAt.getTime());
    checkOutAt.setMinutes(checkOutAt.getMinutes() + intBetween(-15, 120));
    const lateMinutes = Math.max(0, Math.floor((checkInAt.getTime() - scheduledStartAt.getTime()) / 60000));
    const overtimeMinutes = Math.max(0, Math.floor((checkOutAt.getTime() - scheduledEndAt.getTime()) / 60000));
    const status = lateMinutes > 0 ? 'late' : 'present';
    return {
      tenant_Id: TENANT_ID,
      employeeId: employee.id,
      workDate,
      workShiftId: workShift?.id ?? null,
      checkInAt,
      checkOutAt,
      scheduledStartAt,
      scheduledEndAt,
      lateMinutes,
      overtimeMinutes,
      status,
      note: 'Dữ liệu chấm công demo',
      createdAt: new Date(workDate),
      updatedAt: new Date()
    };
  });
  await prisma.attendance.createMany({ data: attendanceRows });

  const leavePolicyByType = new Map<string, (typeof leavePolicies)[number]>();
  for (const policy of leavePolicies) {
    if (!leavePolicyByType.has(policy.leaveType)) {
      leavePolicyByType.set(policy.leaveType, policy);
    }
  }

  const leaveRows = Array.from({ length: COUNTS.leaveRequests }, (_, idx) => {
    const employee = employees[idx % employees.length];
    const leaveType = pick(leaveTypes);
    const policy = leavePolicyByType.get(leaveType) ?? null;
    const startDate = randomPastDate(150);
    const endDate = randomFutureDate(startDate, 5);
    const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    const status = pick([GenericStatus.PENDING, GenericStatus.APPROVED, GenericStatus.REJECTED]);
    return {
      tenant_Id: TENANT_ID,
      employeeId: employee.id,
      leavePolicyId: policy?.id ?? null,
      leaveType,
      startDate,
      endDate,
      durationDays: decimal(durationDays),
      reason: `Lý do nghỉ demo ${idx + 1}`,
      attachmentUrl: leaveType === 'om_dau' ? `https://files.demo.local/medical/${idx + 1}.pdf` : null,
      status,
      approvedBy: status === GenericStatus.PENDING ? null : pick(approvers).id,
      createdAt: randomPastDate(160),
      updatedAt: new Date()
    };
  });
  await prisma.leaveRequest.createMany({ data: leaveRows });

  const payrollRows = Array.from({ length: COUNTS.payrolls }, (_, idx) => {
    const employee = employees[idx % employees.length];
    const gross = Number(employee.baseSalary ?? decimal(intBetween(8_000_000, 25_000_000)));
    const deduction = intBetween(150_000, 1_200_000);
    const net = Math.max(gross - deduction, 0);
    const status = pick([GenericStatus.DRAFT, GenericStatus.PENDING, GenericStatus.APPROVED]);
    const paidAt = status === GenericStatus.APPROVED ? randomPastDate(60) : null;
    const payMonth = pick([1, 2, 3]);
    const periodStart = new Date(2026, payMonth - 1, 1);
    const periodEnd = new Date(2026, payMonth, 0, 23, 59, 59, 999);
    return {
      tenant_Id: TENANT_ID,
      employeeId: employee.id,
      payMonth,
      payYear: 2026,
      periodStart,
      periodEnd,
      workingDays: Number((18 + random() * 6).toFixed(1)),
      paidLeaveDays: Number((random() * 2).toFixed(1)),
      unpaidLeaveDays: Number((random() * 1.5).toFixed(1)),
      overtimeHours: Number((random() * 14).toFixed(1)),
      grossSalary: decimal(gross),
      deduction: decimal(deduction),
      netSalary: decimal(net),
      note: 'Bảng lương seed demo',
      status,
      paidAt,
      lockedAt: status === GenericStatus.APPROVED ? randomPastDate(50) : null,
      createdAt: randomPastDate(90),
      updatedAt: new Date()
    };
  });
  await prisma.payroll.createMany({ data: payrollRows });
  const payrollEntities = await prisma.payroll.findMany({
    where: { tenant_Id: TENANT_ID, payYear: 2026 },
    orderBy: [{ payMonth: 'asc' }, { createdAt: 'asc' }]
  });
  const payrollLineRows = payrollEntities.flatMap((payroll, idx) => {
    const gross = Number(payroll.grossSalary ?? decimal(intBetween(8_000_000, 25_000_000)));
    const deduction = Number(payroll.deduction ?? decimal(intBetween(100_000, 1_000_000)));
    const overtime = Number((gross * 0.08).toFixed(2));
    return [
      {
        tenant_Id: TENANT_ID,
        payrollId: payroll.id,
        employeeId: payroll.employeeId,
        componentCode: 'BASE_SALARY',
        componentName: 'Luong co ban',
        componentType: PayrollComponentType.EARNING,
        amount: decimal(gross),
        isTaxable: true,
        note: null,
        createdAt: randomPastDate(80),
        updatedAt: new Date()
      },
      {
        tenant_Id: TENANT_ID,
        payrollId: payroll.id,
        employeeId: payroll.employeeId,
        componentCode: 'OVERTIME',
        componentName: 'Luong tang ca',
        componentType: PayrollComponentType.EARNING,
        amount: decimal(overtime),
        isTaxable: true,
        note: null,
        createdAt: randomPastDate(80),
        updatedAt: new Date()
      },
      {
        tenant_Id: TENANT_ID,
        payrollId: payroll.id,
        employeeId: payroll.employeeId,
        componentCode: 'DEDUCTION_TOTAL',
        componentName: 'Tong khau tru',
        componentType: PayrollComponentType.DEDUCTION,
        amount: decimal(deduction),
        isTaxable: false,
        note: `Khau tru tong hop ${idx + 1}`,
        createdAt: randomPastDate(80),
        updatedAt: new Date()
      }
    ];
  });
  await prisma.payrollLineItem.createMany({ data: payrollLineRows });

  const recruitmentRows = Array.from({ length: COUNTS.recruitments }, (_, idx) => ({
    tenant_Id: TENANT_ID,
    jobTitle: `Vị trí Demo ${intBetween(1, 30)}`,
    candidateName: `Ứng viên Demo ${idx + 1}`,
    stage: pick(recruitmentStages),
    status: pick([GenericStatus.PENDING, GenericStatus.APPROVED, GenericStatus.REJECTED]),
    createdAt: randomPastDate(180),
    updatedAt: new Date()
  }));
  await prisma.recruitment.createMany({ data: recruitmentRows });

  const trainingRows = Array.from({ length: COUNTS.trainings }, (_, idx) => {
    const employee = employees[idx % employees.length];
    const status = pick([GenericStatus.PENDING, GenericStatus.APPROVED]);
    const completedAt = status === GenericStatus.APPROVED ? randomPastDate(120) : null;
    return {
      tenant_Id: TENANT_ID,
      title: `Khóa đào tạo Demo ${idx + 1}`,
      employeeId: employee.id,
      completedAt,
      status,
      createdAt: randomPastDate(220),
      updatedAt: new Date()
    };
  });
  await prisma.training.createMany({ data: trainingRows });

  const performanceRows = Array.from({ length: COUNTS.performances }, (_, idx) => {
    const employee = employees[idx % employees.length];
    return {
      tenant_Id: TENANT_ID,
      employeeId: employee.id,
      period: pick(['Q4-2025', 'Q1-2026', 'Q2-2026']),
      score: Number((random() * 5).toFixed(2)),
      reviewerId: pick(approvers).id,
      note: `Nhận xét hiệu suất demo ${idx + 1}`,
      createdAt: randomPastDate(200),
      updatedAt: new Date()
    };
  });
  await prisma.performance.createMany({ data: performanceRows });

  const benefitRows = Array.from({ length: COUNTS.benefits }, (_, idx) => {
    const employee = employees[idx % employees.length];
    return {
      tenant_Id: TENANT_ID,
      employeeId: employee.id,
      benefitType: pick(benefitTypes),
      amount: decimal(intBetween(200_000, 4_000_000)),
      status: pick([GenericStatus.ACTIVE, GenericStatus.INACTIVE]),
      createdAt: randomPastDate(180),
      updatedAt: new Date()
    };
  });
  await prisma.benefit.createMany({ data: benefitRows });

  const taxProfileRows = Array.from({ length: COUNTS.personalIncomeTaxProfiles }, (_, idx) => {
    const employee = employees[idx % employees.length];
    const dependentCount = idx % 4;
    return {
      tenant_Id: TENANT_ID,
      employeeId: employee.id,
      taxCode: `MST${String(1300000000 + idx).slice(-10)}`,
      personalDeduction: decimal(11_000_000),
      dependentCount,
      dependentDeduction: decimal(4_400_000),
      insuranceDeduction: decimal(intBetween(200_000, 1_300_000)),
      otherDeduction: decimal(intBetween(0, 400_000)),
      taxRate: decimal(0.1),
      status: idx % 18 === 0 ? GenericStatus.INACTIVE : GenericStatus.ACTIVE,
      note: 'Hồ sơ thuế TNCN demo',
      createdAt: randomPastDate(180),
      updatedAt: new Date()
    };
  });
  await prisma.personalIncomeTaxProfile.createMany({ data: taxProfileRows });
  const taxProfiles = await prisma.personalIncomeTaxProfile.findMany({
    where: { tenant_Id: TENANT_ID },
    orderBy: { createdAt: 'asc' }
  });
  const taxProfileByEmployeeId = new Map(taxProfiles.map((profile) => [profile.employeeId, profile]));

  const grossTaxableByPayrollId = new Map<string, number>();
  for (const line of payrollLineRows) {
    if (line.componentType !== PayrollComponentType.EARNING || !line.isTaxable) continue;
    const amount = Number(line.amount ?? 0);
    grossTaxableByPayrollId.set(line.payrollId, (grossTaxableByPayrollId.get(line.payrollId) ?? 0) + amount);
  }

  const taxRecordRows = payrollEntities.slice(0, COUNTS.personalIncomeTaxRecords).map((payroll, idx) => {
    const profile = taxProfileByEmployeeId.get(payroll.employeeId) ?? null;
    const grossTaxable = grossTaxableByPayrollId.get(payroll.id) ?? Number(payroll.grossSalary ?? 0);
    const personalDeduction = Number(profile?.personalDeduction ?? 11_000_000);
    const dependentCount = profile?.dependentCount ?? 0;
    const dependentDeduction = Number(profile?.dependentDeduction ?? 4_400_000);
    const insuranceDeduction = Number(profile?.insuranceDeduction ?? 0);
    const otherDeduction = Number(profile?.otherDeduction ?? 0);
    const deduction = personalDeduction + dependentCount * dependentDeduction + insuranceDeduction + otherDeduction;
    const taxableIncome = Math.max(0, grossTaxable - deduction);
    const taxRate = Number(profile?.taxRate ?? 0.1);
    const taxAmount = taxableIncome * taxRate;
    return {
      tenant_Id: TENANT_ID,
      employeeId: payroll.employeeId,
      payrollId: payroll.id,
      taxProfileId: profile?.id ?? null,
      taxMonth: payroll.payMonth,
      taxYear: payroll.payYear,
      grossTaxable: decimal(grossTaxable),
      deduction: decimal(deduction),
      taxableIncome: decimal(taxableIncome),
      taxRate: decimal(taxRate),
      taxAmount: decimal(taxAmount),
      status: idx % 3 === 0 ? GenericStatus.PENDING : GenericStatus.DRAFT,
      note: 'Bản ghi thuế TNCN demo',
      lockedAt: idx % 7 === 0 ? randomPastDate(45) : null,
      createdAt: randomPastDate(80),
      updatedAt: new Date()
    };
  });
  await prisma.personalIncomeTaxRecord.createMany({ data: taxRecordRows });

  const goalRows = Array.from({ length: COUNTS.goals }, (_, idx) => {
    const employee = employees[idx % employees.length];
    const targetValue = intBetween(80, 140);
    const currentValue = intBetween(0, targetValue + 30);
    const progressPercent = Math.min(100, Number(((currentValue / targetValue) * 100).toFixed(2)));
    const startDate = new Date(2026, 0, 1);
    const endDate = new Date(2026, 2, 31);
    const status =
      progressPercent >= 100
        ? GenericStatus.APPROVED
        : progressPercent > 0
          ? GenericStatus.ACTIVE
          : GenericStatus.PENDING;
    return {
      tenant_Id: TENANT_ID,
      employeeId: employee.id,
      goalCode: code(`${DEMO}-GOAL-`, idx + 1, 5),
      title: `Mục tiêu nhân sự demo ${idx + 1}`,
      description: `Theo dõi mục tiêu nhân sự kỳ Q${(idx % 4) + 1}/2026`,
      period: pick(['Q1-2026', 'Q2-2026', 'Q3-2026', 'Q4-2026']),
      targetValue: decimal(targetValue),
      currentValue: decimal(currentValue),
      progressPercent,
      weight: Number((0.8 + random() * 0.7).toFixed(2)),
      startDate,
      endDate,
      completedAt: progressPercent >= 100 ? randomPastDate(25) : null,
      status,
      note: 'Mục tiêu nhân sự demo',
      createdBy: pick(approvers).id,
      createdAt: randomPastDate(120),
      updatedAt: new Date()
    };
  });
  await prisma.hrGoal.createMany({ data: goalRows });

  const hrEventRows = Array.from({ length: COUNTS.hrEvents }, (_, idx) => {
    const employee = employees[idx % employees.length];
    const eventType = pick([
      'ONBOARD',
      'PROMOTION',
      'TRANSFER',
      'LEAVE_APPROVED',
      'BENEFIT_UPDATED',
      'CONTRACT_RENEWED'
    ]);
    return {
      tenant_Id: TENANT_ID,
      employeeId: employee.id,
      eventType,
      effectiveAt: randomPastDate(300),
      payload: {
        source: 'seed-demo',
        eventIndex: idx + 1,
        note: `Sự kiện ${eventType} demo`
      },
      createdBy: pick(approvers).id,
      createdAt: randomPastDate(300),
      updatedAt: new Date()
    };
  });
  await prisma.hrEvent.createMany({ data: hrEventRows });

  const orderPlan = Array.from({ length: COUNTS.orders }, (_, idx) => {
    const i = idx + 1;
    const customer = customers[idx % customers.length];
    const createdBy = pick(users).id;
    const productA = products[(idx * 3) % products.length];
    const productB = products[(idx * 7 + 5) % products.length];
    const qtyA = intBetween(1, 5);
    const qtyB = intBetween(1, 3);
    const total = qtyA * Number(productA.unitPrice) + qtyB * Number(productB.unitPrice);

    return {
      orderNo: code(`${DEMO}-SO-`, i, 5),
      customerId: customer.id,
      customerName: customer.fullName,
      totalAmount: total,
      status: pick(orderStatuses),
      createdBy,
      createdAt: randomPastDate(180),
      items: [
        { productId: productA.id, productName: productA.name, quantity: qtyA, unitPrice: Number(productA.unitPrice) },
        { productId: productB.id, productName: productB.name, quantity: qtyB, unitPrice: Number(productB.unitPrice) }
      ]
    };
  });

  await prisma.order.createMany({
    data: orderPlan.map((row) => ({
      tenant_Id: TENANT_ID,
      orderNo: row.orderNo,
      customerId: row.customerId,
      customerName: row.customerName,
      totalAmount: decimal(row.totalAmount),
      status: row.status,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: new Date()
    }))
  });

  const orders = await prisma.order.findMany({
    where: { tenant_Id: TENANT_ID, orderNo: { startsWith: `${DEMO}-SO-` } },
    orderBy: { orderNo: 'asc' }
  });
  const orderByNo = new Map(orders.map((order) => [order.orderNo ?? '', order]));

  const orderItemRows = orderPlan.flatMap((plan) => {
    const order = orderByNo.get(plan.orderNo);
    if (!order) return [];
    return plan.items.map((item) => ({
      tenant_Id: TENANT_ID,
      orderId: order.id,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: decimal(item.unitPrice),
      createdAt: plan.createdAt,
      updatedAt: new Date()
    }));
  });
  await prisma.orderItem.createMany({ data: orderItemRows });

  const purchaseOrderPlan = Array.from({ length: COUNTS.purchaseOrders }, (_, idx) => {
    const i = idx + 1;
    const vendor = vendors[idx % vendors.length];
    return {
      poNo: code(`${DEMO}-PO-`, i, 5),
      vendorId: vendor.id,
      totalAmount: intBetween(3_000_000, 60_000_000),
      status: pick([GenericStatus.PENDING, GenericStatus.APPROVED, GenericStatus.REJECTED]),
      createdAt: randomPastDate(180)
    };
  });
  await prisma.purchaseOrder.createMany({
    data: purchaseOrderPlan.map((row) => ({
      tenant_Id: TENANT_ID,
      poNo: row.poNo,
      vendorId: row.vendorId,
      totalAmount: decimal(row.totalAmount),
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: new Date()
    }))
  });
  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: { tenant_Id: TENANT_ID, poNo: { startsWith: `${DEMO}-PO-` } },
    orderBy: { poNo: 'asc' }
  });
  const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]));

  const shipmentRows = Array.from({ length: COUNTS.shipments }, (_, idx) => {
    const po = purchaseOrders[idx % purchaseOrders.length];
    const shippedAt = randomPastDate(120);
    const status = pick([GenericStatus.PENDING, GenericStatus.APPROVED]);
    const deliveredAt = status === GenericStatus.APPROVED ? randomFutureDate(shippedAt, 7) : null;
    return {
      tenant_Id: TENANT_ID,
      shipmentNo: code(`${DEMO}-SHIP-`, idx + 1, 5),
      orderRef: po.poNo,
      carrier: pick(['GHN', 'GHTK', 'VNPost', 'ViettelPost']),
      status,
      shippedAt,
      deliveredAt,
      createdAt: randomPastDate(140),
      updatedAt: new Date()
    };
  });
  await prisma.shipment.createMany({ data: shipmentRows });

  const distributionRows = Array.from({ length: COUNTS.distributions }, (_, idx) => ({
    tenant_Id: TENANT_ID,
    distributionNo: code(`${DEMO}-DIST-`, idx + 1, 5),
    destination: pick(distributionDestinations),
    status: pick([GenericStatus.PENDING, GenericStatus.APPROVED]),
    createdAt: randomPastDate(150),
    updatedAt: new Date()
  }));
  await prisma.distribution.createMany({ data: distributionRows });

  const demandForecastRows = Array.from({ length: COUNTS.demandForecasts }, (_, idx) => {
    const product = products[idx % products.length];
    return {
      tenant_Id: TENANT_ID,
      sku: product.sku,
      period: pick(forecastPeriods),
      predictedQty: intBetween(20, 300),
      confidence: Number((0.65 + random() * 0.34).toFixed(2)),
      createdAt: randomPastDate(110),
      updatedAt: new Date()
    };
  });
  await prisma.demandForecast.createMany({ data: demandForecastRows });

  const supplyChainRiskRows = Array.from({ length: COUNTS.supplyChainRisks }, (_, idx) => ({
    tenant_Id: TENANT_ID,
    title: `Rủi ro chuỗi cung ứng demo ${idx + 1}`,
    severity: pick(riskSeverities),
    mitigation: `Biện pháp xử lý demo ${idx + 1}`,
    status: pick([GenericStatus.PENDING, GenericStatus.APPROVED]),
    createdAt: randomPastDate(160),
    updatedAt: new Date()
  }));
  await prisma.supplyChainRisk.createMany({ data: supplyChainRiskRows });

  const invoicePlan = Array.from({ length: COUNTS.invoices }, (_, idx) => {
    const i = idx + 1;
    if (idx < 100) {
      const order = orders[idx % orders.length];
      const customer = customers.find((c) => c.id === order.customerId) ?? customers[idx % customers.length];
      return {
        invoiceNo: code(`${DEMO}-INV-`, i, 5),
        invoiceType: 'AR',
        partnerName: customer.fullName,
        totalAmount: Number(order.totalAmount ?? 0),
        dueAt: randomFutureDate(randomPastDate(30), 25),
        status: pick([GenericStatus.PENDING, GenericStatus.APPROVED]),
        createdAt: randomPastDate(120),
        sourceOrderNo: order.orderNo ?? null,
        sourceCustomerId: customer.id
      };
    }

    const po = purchaseOrders[idx % purchaseOrders.length];
    const vendor = (po.vendorId ? vendorById.get(po.vendorId) : null) ?? pick(vendors);
    return {
      invoiceNo: code(`${DEMO}-INV-`, i, 5),
      invoiceType: 'AP',
      partnerName: vendor.name,
      totalAmount: Number(po.totalAmount ?? 0),
      dueAt: randomFutureDate(randomPastDate(20), 35),
      status: pick([GenericStatus.PENDING, GenericStatus.APPROVED, GenericStatus.REJECTED]),
      createdAt: randomPastDate(120),
      sourceOrderNo: null,
      sourceCustomerId: null
    };
  });

  await prisma.invoice.createMany({
    data: invoicePlan.map((row) => ({
      tenant_Id: TENANT_ID,
      invoiceNo: row.invoiceNo,
      invoiceType: row.invoiceType,
      partnerName: row.partnerName,
      totalAmount: decimal(row.totalAmount),
      dueAt: row.dueAt,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: new Date()
    }))
  });
  const invoices = await prisma.invoice.findMany({
    where: { tenant_Id: TENANT_ID, invoiceNo: { startsWith: `${DEMO}-INV-` } },
    orderBy: { invoiceNo: 'asc' }
  });
  const invoiceByNo = new Map(invoices.map((invoice) => [invoice.invoiceNo ?? '', invoice]));
  const invoicePlanByNo = new Map(invoicePlan.map((plan) => [plan.invoiceNo, plan]));

  const paymentRequestRows = Array.from({ length: COUNTS.paymentRequests }, (_, idx) => {
    const invoice = invoices[idx % invoices.length];
    const plan = invoicePlanByNo.get(invoice.invoiceNo ?? '');
    const customer = plan?.sourceCustomerId ? customers.find((row) => row.id === plan.sourceCustomerId) : null;
    const status = idx % 3 === 0 ? 'DA_THANH_TOAN' : 'DA_GUI';
    const sentAt = randomPastDate(90);
    const paidAt = status === 'DA_THANH_TOAN' ? randomFutureDate(sentAt, 10) : null;
    return {
      tenant_Id: TENANT_ID,
      customerId: customer?.id ?? null,
      invoiceId: invoice.id,
      invoiceNo: invoice.invoiceNo ?? null,
      orderNo: plan?.sourceOrderNo ?? null,
      channel: idx % 2 === 0 ? 'ZALO' : 'EMAIL',
      recipient: idx % 2 === 0 ? customer?.phone ?? null : customer?.email ?? null,
      qrCodeUrl: `https://pay.demo.local/qr/${invoice.invoiceNo ?? idx}`,
      amount: invoice.totalAmount ? decimal(Number(invoice.totalAmount)) : null,
      status,
      sentAt,
      paidAt,
      note: `Yêu cầu thanh toán demo ${idx + 1}`,
      createdAt: randomPastDate(95),
      updatedAt: new Date()
    };
  });
  await prisma.paymentRequest.createMany({ data: paymentRequestRows });

  const customerInteractionRows = Array.from({ length: COUNTS.interactions }, (_, idx) => {
    const customer = customers[idx % customers.length];
    const employee = employees[idx % employees.length];
    const interactionAt = randomPastDate(120);
    return {
      tenant_Id: TENANT_ID,
      customerId: customer.id,
      interactionType: pick(interactionTypes),
      channel: pick(interactionChannels),
      content: `Nội dung tương tác demo #${idx + 1} với ${customer.fullName}`,
      resultTag: pick(interactionResultTags),
      staffName: employee.fullName,
      staffCode: employee.code,
      interactionAt,
      nextActionAt: randomFutureDate(interactionAt, 20),
      createdAt: interactionAt,
      updatedAt: new Date()
    };
  });
  await prisma.customerInteraction.createMany({ data: customerInteractionRows });

  // ── CRM Distribution: Assignment Logs ──────────────────────────
  const assignmentActions: CustomerAssignmentAction[] = [
    CustomerAssignmentAction.AUTO_ASSIGNED,
    CustomerAssignmentAction.MANUAL_ASSIGNED,
    CustomerAssignmentAction.RECLAIMED_IDLE,
    CustomerAssignmentAction.RECLAIMED_FAILED,
    CustomerAssignmentAction.ROTATION,
    CustomerAssignmentAction.RETURNED_TO_POOL
  ];
  const assignmentReasons = [
    'Chia tự động (ROUND_ROBIN)',
    'Chia tự động (LEAST_PENDING)',
    'Chia tự động khi tạo KH (CAP_FILL)',
    'Gán bởi admin',
    'Thu hồi: không chăm sóc sau 24h',
    'Thu hồi do tư vấn thất bại',
    'Quay vòng lần 1: NV cũ tư vấn thất bại',
    'Quay vòng lần 2: NV cũ tư vấn thất bại',
    'Hết vòng quay (3 lần). Cần admin xử lý.',
    'Không còn NV nào chưa chăm sóc KH này.'
  ];
  const strategies = ['ROUND_ROBIN', 'LEAST_PENDING', 'CAP_FILL', 'KPI_WEIGHTED'];
  const triggeredBys = ['system-scheduler', 'system-auto', 'admin:user.0001@demo-erp.local'];

  const assignmentLogRows = Array.from({ length: 40 }, (_, idx) => {
    const customer = customers[idx % customers.length];
    const action = assignmentActions[idx % assignmentActions.length];
    const fromStaff = idx % 3 === 0 ? null : activeSalesStaff[idx % activeSalesStaff.length].id;
    const toStaff = action === CustomerAssignmentAction.RETURNED_TO_POOL || action === CustomerAssignmentAction.RECLAIMED_IDLE
      ? null
      : activeSalesStaff[(idx + 1) % activeSalesStaff.length].id;
    return {
      tenant_Id: TENANT_ID,
      customerId: customer.id,
      fromStaffId: fromStaff,
      toStaffId: toStaff,
      action,
      reason: assignmentReasons[idx % assignmentReasons.length],
      strategyUsed: action === CustomerAssignmentAction.AUTO_ASSIGNED ? pick(strategies) : null,
      rotationRound: action === CustomerAssignmentAction.ROTATION ? (idx % 3) + 1 : 0,
      triggeredBy: pick(triggeredBys),
      createdAt: randomPastDate(60)
    };
  });
  await prisma.customerAssignmentLog.createMany({ data: assignmentLogRows });

  // ── CRM Distribution: Rotation Blacklist ───────────────────────
  const blacklistPairs = new Set<string>();
  const blacklistRows: Array<{ tenant_Id: string; customerId: string; staffId: string; blockedAt: Date }> = [];
  for (let idx = 0; idx < 10; idx++) {
    const customer = customers[(idx * 3) % customers.length];
    const staff = activeSalesStaff[idx % activeSalesStaff.length];
    const key = `${customer.id}:${staff.id}`;
    if (!blacklistPairs.has(key)) {
      blacklistPairs.add(key);
      blacklistRows.push({
        tenant_Id: TENANT_ID,
        customerId: customer.id,
        staffId: staff.id,
        blockedAt: randomPastDate(30)
      });
    }
  }
  await prisma.customerRotationBlacklist.createMany({ data: blacklistRows });

  const customerMergeLogRows = Array.from({ length: COUNTS.customerMergeLogs }, (_, idx) => {
    const primary = customers[idx % customers.length];
    const merged = customers[(customers.length - 1 - idx + customers.length) % customers.length];
    return {
      tenant_Id: TENANT_ID,
      primaryCustomerId: primary.id,
      mergedCustomerId: merged.id,
      mergedBy: pick(approvers).id,
      note: `Bản ghi mô phỏng gộp khách hàng #${idx + 1}`,
      mergedAt: randomPastDate(90),
      createdAt: randomPastDate(90),
      updatedAt: new Date()
    };
  }).filter((row) => row.primaryCustomerId !== row.mergedCustomerId);
  await prisma.customerMergeLog.createMany({ data: customerMergeLogRows });

  const assetAllocationRows = Array.from({ length: COUNTS.assetAllocations }, (_, idx) => {
    const asset = assets[idx % assets.length];
    const employee = employees[idx % employees.length];
    const allocatedAt = randomPastDate(200);
    const status = idx % 5 === 0 ? GenericStatus.ARCHIVED : GenericStatus.ACTIVE;
    const returnedAt = status === GenericStatus.ARCHIVED ? randomFutureDate(allocatedAt, 60) : null;
    return {
      tenant_Id: TENANT_ID,
      assetId: asset.id,
      employeeId: employee.id,
      allocatedAt,
      returnedAt,
      status,
      createdAt: allocatedAt,
      updatedAt: new Date()
    };
  });
  await prisma.assetAllocation.createMany({ data: assetAllocationRows });

  const projectTaskRows = Array.from({ length: COUNTS.projectTasks }, (_, idx) => {
    const project = projects[idx % projects.length];
    return {
      tenant_Id: TENANT_ID,
      projectId: project.id,
      title: `Công việc demo ${idx + 1}`,
      assignedTo: pick(employees).id,
      status: pick([GenericStatus.PENDING, GenericStatus.APPROVED, GenericStatus.REJECTED]),
      dueAt: randomFutureDate(randomPastDate(40), 50),
      createdAt: randomPastDate(90),
      updatedAt: new Date()
    };
  });
  await prisma.projectTask.createMany({ data: projectTaskRows });

  const projectResourceRows = Array.from({ length: COUNTS.projectResources }, (_, idx) => {
    const project = projects[idx % projects.length];
    const resourceType = pick(['nhan_vien', 'thiet_bi', 'xe_van_chuyen']);
    let resourceRef = '';
    if (resourceType === 'nhan_vien') {
      resourceRef = pick(employees).code ?? `EMP-${idx + 1}`;
    } else if (resourceType === 'thiet_bi') {
      resourceRef = pick(assets).assetCode ?? `AST-${idx + 1}`;
    } else {
      resourceRef = `XE-${String(idx + 1).padStart(4, '0')}`;
    }
    return {
      tenant_Id: TENANT_ID,
      projectId: project.id,
      resourceType,
      resourceRef,
      quantity: Number((1 + random() * 5).toFixed(2)),
      createdAt: randomPastDate(100),
      updatedAt: new Date()
    };
  });
  await prisma.projectResource.createMany({ data: projectResourceRows });

  const projectBudgetRows = Array.from({ length: COUNTS.projectBudgets }, (_, idx) => {
    const project = projects[idx % projects.length];
    return {
      tenant_Id: TENANT_ID,
      projectId: project.id,
      budgetType: pick(['nhan_su', 'van_hanh', 'marketing', 'du_phong']),
      amount: decimal(intBetween(10_000_000, 500_000_000)),
      createdAt: randomPastDate(90),
      updatedAt: new Date()
    };
  });
  await prisma.projectBudget.createMany({ data: projectBudgetRows });

  const timeEntryRows = Array.from({ length: COUNTS.timeEntries }, (_, idx) => {
    const project = projects[idx % projects.length];
    const employee = employees[idx % employees.length];
    return {
      tenant_Id: TENANT_ID,
      projectId: project.id,
      employeeId: employee.id,
      workDate: randomPastDate(70),
      hours: Number((3 + random() * 6).toFixed(2)),
      note: `Giờ công demo ${idx + 1}`,
      createdAt: randomPastDate(80),
      updatedAt: new Date()
    };
  });
  await prisma.timeEntry.createMany({ data: timeEntryRows });

  const workflowInstanceRows = Array.from({ length: COUNTS.workflowInstances }, (_, idx) => {
    const definition = workflowDefinitions[idx % workflowDefinitions.length];
    const targetType = pick(workflowTargets);
    let targetId = '';
    if (targetType === 'ORDER') {
      targetId = pick(orders).id;
    } else if (targetType === 'INVOICE') {
      targetId = pick(invoices).id;
    } else {
      targetId = pick(projects).id;
    }
    return {
      tenant_Id: TENANT_ID,
      definitionId: definition.id,
      targetType,
      targetId,
      currentStep: pick(workflowSteps),
      status: pick([GenericStatus.PENDING, GenericStatus.APPROVED, GenericStatus.REJECTED]),
      startedBy: pick(users).id,
      createdAt: randomPastDate(100),
      updatedAt: new Date()
    };
  });
  await prisma.workflowInstance.createMany({ data: workflowInstanceRows });

  const approvalRows = Array.from({ length: COUNTS.approvals }, (_, idx) => {
    const targetType = pick(['ORDER_EDIT', 'INVOICE_APPROVAL', 'PROJECT_GATE']);
    let targetId = '';
    if (targetType === 'ORDER_EDIT') {
      targetId = pick(orders).id;
    } else if (targetType === 'INVOICE_APPROVAL') {
      targetId = pick(invoices).id;
    } else {
      targetId = pick(projects).id;
    }
    const status = pick(approvalStatuses);
    const decidedAt = status === GenericStatus.PENDING ? null : randomPastDate(60);
    return {
      tenant_Id: TENANT_ID,
      targetType,
      targetId,
      requesterId: pick(users).id,
      approverId: pick(approvers).id,
      contextJson: {
        reason: `Yêu cầu duyệt demo ${idx + 1}`,
        source: 'seed-demo',
        module: pick(modules)
      } as any,
      status,
      decidedAt,
      createdAt: randomPastDate(100),
      updatedAt: new Date()
    };
  });
  await prisma.approval.createMany({ data: approvalRows });

  const accountRows = Array.from({ length: COUNTS.accounts }, (_, idx) => ({
    tenant_Id: TENANT_ID,
    accountCode: code(`${DEMO}-ACC-`, idx + 1, 4),
    name: `Tài khoản Demo ${idx + 1}`,
    accountType: pick(accountTypes),
    balance: decimal(intBetween(2_000_000, 2_000_000_000)),
    createdAt: randomPastDate(220),
    updatedAt: new Date()
  }));
  await prisma.account.createMany({ data: accountRows });

  const journalRows = Array.from({ length: COUNTS.journalEntries }, (_, idx) => ({
    tenant_Id: TENANT_ID,
    entryNo: code(`${DEMO}-JE-`, idx + 1, 5),
    entryDate: randomPastDate(200),
    description: `Bút toán demo ${idx + 1}`,
    status: pick([GenericStatus.DRAFT, GenericStatus.APPROVED]),
    createdAt: randomPastDate(220),
    updatedAt: new Date()
  }));
  await prisma.journalEntry.createMany({ data: journalRows });

  const budgetPlanRows = Array.from({ length: COUNTS.budgetPlans }, (_, idx) => ({
    tenant_Id: TENANT_ID,
    category: pick(['marketing', 'van_hanh', 'nhan_su', 'dau_tu']),
    fiscalPeriod: pick(['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4']),
    plannedAmount: decimal(intBetween(20_000_000, 900_000_000)),
    actualAmount: decimal(intBetween(10_000_000, 850_000_000)),
    createdAt: randomPastDate(150),
    updatedAt: new Date()
  }));
  await prisma.budgetPlan.createMany({ data: budgetPlanRows });

  const reportRows = Array.from({ length: COUNTS.reports }, (_, idx) => ({
    tenant_Id: TENANT_ID,
    reportType: pick(reportTypes),
    name: `Báo cáo Demo ${idx + 1}`,
    configJson: {
      moduleName: pick(modules),
      groupBy: pick(['day', 'week', 'month']),
      limit: pick([20, 50, 100]),
      quickRange: pick(['7D', '30D', 'THIS_MONTH', 'LAST_MONTH', 'THIS_YEAR', 'ALL'])
    } as any,
    generatedAt: randomPastDate(60),
    createdAt: randomPastDate(70),
    updatedAt: new Date()
  }));
  await prisma.report.createMany({ data: reportRows });

  const systemConfig = {
    companyName: 'Công ty ERP Bán lẻ Demo',
    taxCode: '0312345678',
    address: 'Thành phố Hồ Chí Minh',
    currency: 'VND',
    dateFormat: 'DD/MM/YYYY',
    enabledModules: runtimeEnabledModules,
    orderSettings: {
      allowIncreaseWithoutApproval: true,
      requireApprovalForDecrease: true,
      approverId: approvers[0]?.id ?? ''
    },
    bhtotSync: {
      enabled: true,
      baseUrl: 'http://localhost:8080',
      apiKey: 'demo_bhtot_key',
      timeoutMs: 12000,
      ordersStateKey: 'bhtot_orders',
      usersStateKey: 'bhtot_users',
      syncAllUsersAsEmployees: false,
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: 'IDLE',
      lastSyncSummary: null
    }
  };

  await prisma.setting.createMany({
    data: [
      {
        tenant_Id: TENANT_ID,
        settingKey: 'system_config',
        settingValue: systemConfig as any
      },
      {
        tenant_Id: TENANT_ID,
        settingKey: 'order_settings',
        settingValue: systemConfig.orderSettings as any
      },
      {
        tenant_Id: TENANT_ID,
        settingKey: 'bhtot_sync_last_result',
        settingValue: {
          syncedAt: new Date().toISOString(),
          status: 'SEED_DEMO',
          imported: {
            customers: COUNTS.customers,
            employees: COUNTS.employees,
            orders: COUNTS.orders
          }
        } as any
      },
      {
        tenant_Id: TENANT_ID,
        settingKey: 'ui_theme',
        settingValue: { primaryColor: 'green', textWeight: 'light', language: 'vi' } as any
      },
      {
        tenant_Id: TENANT_ID,
        settingKey: 'settings.org_profile.v1',
        settingValue: {
          companyName: systemConfig.companyName,
          taxCode: systemConfig.taxCode,
          address: systemConfig.address,
          enabledModules: runtimeEnabledModules,
          branding: { logoUrl: '', primaryColor: '#3f8f50' },
          documentLayout: { invoiceTemplate: 'retail', showCompanySeal: true }
        } as any
      },
      {
        tenant_Id: TENANT_ID,
        settingKey: 'settings.locale_calendar.v1',
        settingValue: {
          timezone: 'Asia/Ho_Chi_Minh',
          dateFormat: 'DD/MM/YYYY',
          numberFormat: 'vi-VN',
          currency: 'VND',
          firstDayOfWeek: 'monday',
          fiscalYearStartMonth: 1
        } as any
      },
      {
        tenant_Id: TENANT_ID,
        settingKey: 'settings.approval_matrix.v1',
        settingValue: {
          rules: [
            { module: 'sales', minAmount: 0, approverRole: 'USER' },
            { module: 'finance', minAmount: 0, approverRole: 'USER' },
            { module: 'scm', minAmount: 0, approverRole: 'USER' },
            { module: 'hr', minAmount: 0, approverRole: 'USER' }
          ],
          escalation: { enabled: true, slaHours: 24, escalateToRole: 'ADMIN' },
          delegation: { enabled: true, maxDays: 14 }
        } as any
      },
      {
        tenant_Id: TENANT_ID,
        settingKey: 'settings.finance_controls.v1',
        settingValue: {
          postingPeriods: {
            lockedPeriods: ['2025-12'],
            allowBackdateDays: 3
          },
          documentNumbering: {
            invoicePrefix: 'INV',
            orderPrefix: 'SO',
            autoNumber: true
          },
          transactionCutoffHour: 23
        } as any
      },
      {
        tenant_Id: TENANT_ID,
        settingKey: 'settings.catalog_scm_policies.v1',
        settingValue: {
          uomDefault: 'PCS',
          priceListDefault: 'STANDARD',
          warehouseDefault: 'MAIN',
          replenishment: { enabled: true, minStockThreshold: 10 },
          receiving: { allowOverReceivePercent: 5 }
        } as any
      },
      {
        tenant_Id: TENANT_ID,
        settingKey: 'settings.notifications_templates.v1',
        settingValue: {
          templatesVersion: 'v1',
          channelPolicy: { email: true, sms: false, zalo: true, inApp: true },
          retry: { maxAttempts: 3, backoffSeconds: 30 }
        } as any
      },
      {
        tenant_Id: TENANT_ID,
        settingKey: 'settings.data_governance_backup.v1',
        settingValue: {
          retentionDays: 365,
          archiveAfterDays: 180,
          backupCadence: 'daily',
          lastBackupAt: new Date().toISOString(),
          exportPolicy: { allowPiiExport: false, requireAdminApproval: true }
        } as any
      },
      {
        tenant_Id: TENANT_ID,
        settingKey: 'settings.numbering.invoice.INV.counter',
        settingValue: {
          value: COUNTS.invoices + 1000,
          updatedAt: new Date().toISOString()
        } as any
      },
      {
        tenant_Id: TENANT_ID,
        settingKey: 'settings.numbering.entry.JE.counter',
        settingValue: {
          value: COUNTS.journalEntries + 2000,
          updatedAt: new Date().toISOString()
        } as any
      },
      {
        tenant_Id: TENANT_ID,
        settingKey: 'settings.sales_crm_policies.v1',
        settingValue: {
          customerTaxonomy: {
            stages: [
              { key: 'MOI', label: 'Mới', color: '#3b82f6', isDefault: true },
              { key: 'DA_TU_VAN', label: 'Đã tư vấn', color: '#f59e0b' },
              { key: 'QUAN_TAM', label: 'Quan tâm', color: '#10b981' },
              { key: 'DA_MUA', label: 'Đã mua', color: '#8b5cf6' },
              { key: 'KHONG_TIEP_TUC', label: 'Không tiếp tục', color: '#ef4444' }
            ],
            sources: [
              { key: 'Zalo', label: 'Zalo', isDefault: true },
              { key: 'Facebook', label: 'Facebook' },
              { key: 'Giới thiệu', label: 'Giới thiệu' },
              { key: 'Website', label: 'Website' },
              { key: 'Cửa hàng', label: 'Cửa hàng' }
            ]
          },
          tagRegistry: { customerTags: ['demo', 'vip', 'ban_le', 'online'], interactionTags: ['quan_tam', 'can_goi_lai', 'da_chot', 'tam_dung'] },
          customerDistribution: {
            enabled: true,
            strategy: 'ROUND_ROBIN',
            capFillTarget: 20,
            kpiMetric: 'revenue',
            kpiPeriod: 'month',
            eligibleStaffFilter: 'all_active',
            eligibleDepartmentIds: [],
            eligiblePositionIds: [],
            duplicateCheckFields: ['phone', 'email'],
            reclaimIdleEnabled: true,
            reclaimIdleAfterHours: 24,
            reclaimFailedEnabled: true,
            reclaimFailedAfterDays: 7,
            rotationMaxRounds: 3,
            failedStatuses: ['KH_TU_CHOI', 'NGUOI_NHA_LAM_THUE_BAO', 'KHONG_NGHE_MAY_LAN_1', 'KHONG_NGHE_MAY_LAN_2'],
            schedulerIntervalMinutes: 15
          }
        } as any
      }
    ]
  });

  const notificationRows = Array.from({ length: COUNTS.notifications }, (_, idx) => ({
    tenant_Id: TENANT_ID,
    userId: pick(users).id,
    title: `Thông báo Demo ${idx + 1}`,
    content: `Nội dung thông báo demo #${idx + 1} cho kiểm thử phân hệ ERP.`,
    templateVersion: idx % 2 === 0 ? 'v1' : 'v1-hotfix',
    isRead: idx % 3 === 0,
    createdAt: randomPastDate(80),
    updatedAt: new Date()
  }));
  await prisma.notification.createMany({ data: notificationRows });

  const seededNotifications = await prisma.notification.findMany({
    where: {
      tenant_Id: TENANT_ID,
      title: { startsWith: 'Thông báo Demo ' }
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      title: true,
      content: true,
      userId: true,
      templateVersion: true
    }
  });

  if (seededNotifications.length > 0) {
    const dispatchRows = seededNotifications.flatMap((notification, idx) => {
      const basePayload = {
        title: notification.title,
        content: notification.content,
        userId: notification.userId,
        templateVersion: notification.templateVersion
      } as const;
      const primary = {
        id: `ndp-${idx + 1}-inapp`,
        tenant_Id: TENANT_ID,
        notificationId: notification.id,
        channel: 'IN_APP',
        status: 'PENDING',
        attemptCount: 0,
        maxAttempts: 3,
        nextRetryAt: null,
        payloadJson: basePayload as any,
        createdAt: randomPastDate(40),
        updatedAt: new Date()
      };
      const secondary = {
        id: `ndp-${idx + 1}-zalo`,
        tenant_Id: TENANT_ID,
        notificationId: notification.id,
        channel: 'ZALO',
        status: idx % 5 === 0 ? 'RETRY' : 'PENDING',
        attemptCount: idx % 5 === 0 ? 1 : 0,
        maxAttempts: 3,
        nextRetryAt: idx % 5 === 0 ? randomFutureDate(new Date(), 2) : null,
        payloadJson: basePayload as any,
        createdAt: randomPastDate(40),
        updatedAt: new Date()
      };
      return [primary, secondary];
    });

    await prisma.notificationDispatch.createMany({ data: dispatchRows as any });
  }

  const customerOrderAggregate = new Map<
    string,
    { totalOrders: number; totalSpent: number; lastOrderAt: Date | null }
  >();

  for (const order of orders) {
    if (!order.customerId) continue;
    const current = customerOrderAggregate.get(order.customerId) ?? {
      totalOrders: 0,
      totalSpent: 0,
      lastOrderAt: null
    };

    current.totalOrders += 1;
    current.totalSpent += Number(order.totalAmount ?? 0);
    if (!current.lastOrderAt || order.createdAt > current.lastOrderAt) {
      current.lastOrderAt = order.createdAt;
    }

    customerOrderAggregate.set(order.customerId, current);
  }

  await prisma.customer.updateMany({
    where: { tenant_Id: TENANT_ID, code: { startsWith: `${DEMO}-CUS-` } },
    data: {
      totalOrders: 0,
      totalSpent: decimal(0),
      lastOrderAt: null
    }
  });

  for (const [customerId, aggregate] of customerOrderAggregate.entries()) {
    await prisma.customer.updateMany({
      where: { tenant_Id: TENANT_ID, id: customerId },
      data: {
        totalOrders: aggregate.totalOrders,
        totalSpent: decimal(aggregate.totalSpent),
        lastOrderAt: aggregate.lastOrderAt,
        customerStage: aggregate.totalOrders > 0 ? 'DA_MUA' : undefined
      }
    });
  }

  const summary = {
    tenant: await prisma.tenant.count({ where: { tenant_Id: TENANT_ID } }),
    users: await prisma.user.count({ where: { tenant_Id: TENANT_ID } }),
    departments: await prisma.department.count({ where: { tenant_Id: TENANT_ID } }),
    positions: await prisma.position.count({ where: { tenant_Id: TENANT_ID } }),
    workShifts: await prisma.workShift.count({ where: { tenant_Id: TENANT_ID } }),
    leavePolicies: await prisma.leavePolicy.count({ where: { tenant_Id: TENANT_ID } }),
    employees: await prisma.employee.count({ where: { tenant_Id: TENANT_ID } }),
    employeeContracts: await prisma.employeeContract.count({ where: { tenant_Id: TENANT_ID } }),
    payrollComponents: await prisma.payrollComponent.count({ where: { tenant_Id: TENANT_ID } }),
    hrEvents: await prisma.hrEvent.count({ where: { tenant_Id: TENANT_ID } }),
    customers: await prisma.customer.count({ where: { tenant_Id: TENANT_ID } }),
    customerInteractions: await prisma.customerInteraction.count({ where: { tenant_Id: TENANT_ID } }),
    customerAssignmentLogs: await prisma.customerAssignmentLog.count({ where: { tenant_Id: TENANT_ID } }),
    customerRotationBlacklist: await prisma.customerRotationBlacklist.count({ where: { tenant_Id: TENANT_ID } }),
    paymentRequests: await prisma.paymentRequest.count({ where: { tenant_Id: TENANT_ID } }),
    products: await prisma.product.count({ where: { tenant_Id: TENANT_ID } }),
    orders: await prisma.order.count({ where: { tenant_Id: TENANT_ID } }),
    orderItems: await prisma.orderItem.count({ where: { tenant_Id: TENANT_ID } }),
    approvals: await prisma.approval.count({ where: { tenant_Id: TENANT_ID } }),
    invoices: await prisma.invoice.count({ where: { tenant_Id: TENANT_ID } }),
    accounts: await prisma.account.count({ where: { tenant_Id: TENANT_ID } }),
    journalEntries: await prisma.journalEntry.count({ where: { tenant_Id: TENANT_ID } }),
    budgetPlans: await prisma.budgetPlan.count({ where: { tenant_Id: TENANT_ID } }),
    vendors: await prisma.vendor.count({ where: { tenant_Id: TENANT_ID } }),
    purchaseOrders: await prisma.purchaseOrder.count({ where: { tenant_Id: TENANT_ID } }),
    shipments: await prisma.shipment.count({ where: { tenant_Id: TENANT_ID } }),
    distributions: await prisma.distribution.count({ where: { tenant_Id: TENANT_ID } }),
    demandForecasts: await prisma.demandForecast.count({ where: { tenant_Id: TENANT_ID } }),
    supplyChainRisks: await prisma.supplyChainRisk.count({ where: { tenant_Id: TENANT_ID } }),
    assets: await prisma.asset.count({ where: { tenant_Id: TENANT_ID } }),
    assetAllocations: await prisma.assetAllocation.count({ where: { tenant_Id: TENANT_ID } }),
    recruitments: await prisma.recruitment.count({ where: { tenant_Id: TENANT_ID } }),
    trainings: await prisma.training.count({ where: { tenant_Id: TENANT_ID } }),
    performances: await prisma.performance.count({ where: { tenant_Id: TENANT_ID } }),
    benefits: await prisma.benefit.count({ where: { tenant_Id: TENANT_ID } }),
    personalIncomeTaxProfiles: await prisma.personalIncomeTaxProfile.count({ where: { tenant_Id: TENANT_ID } }),
    personalIncomeTaxRecords: await prisma.personalIncomeTaxRecord.count({ where: { tenant_Id: TENANT_ID } }),
    goals: await prisma.hrGoal.count({ where: { tenant_Id: TENANT_ID } }),
    attendance: await prisma.attendance.count({ where: { tenant_Id: TENANT_ID } }),
    leaveRequests: await prisma.leaveRequest.count({ where: { tenant_Id: TENANT_ID } }),
    payrolls: await prisma.payroll.count({ where: { tenant_Id: TENANT_ID } }),
    payrollLineItems: await prisma.payrollLineItem.count({ where: { tenant_Id: TENANT_ID } }),
    projects: await prisma.project.count({ where: { tenant_Id: TENANT_ID } }),
    projectTasks: await prisma.projectTask.count({ where: { tenant_Id: TENANT_ID } }),
    projectResources: await prisma.projectResource.count({ where: { tenant_Id: TENANT_ID } }),
    projectBudgets: await prisma.projectBudget.count({ where: { tenant_Id: TENANT_ID } }),
    timeEntries: await prisma.timeEntry.count({ where: { tenant_Id: TENANT_ID } }),
    workflowDefinitions: await prisma.workflowDefinition.count({ where: { tenant_Id: TENANT_ID } }),
    workflowInstances: await prisma.workflowInstance.count({ where: { tenant_Id: TENANT_ID } }),
    reports: await prisma.report.count({ where: { tenant_Id: TENANT_ID } }),
    settings: await prisma.setting.count({ where: { tenant_Id: TENANT_ID } }),
    notifications: await prisma.notification.count({ where: { tenant_Id: TENANT_ID } })
  };

  console.log('\n=== DEMO DATA SEEDED ===');
  console.table(summary);
}

async function main() {
  console.log(`Seeding demo data for tenant "${TENANT_ID}" on ${DATABASE_URL}`);
  await seed();
}

main()
  .catch((error) => {
    console.error('Seed demo thất bại:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
