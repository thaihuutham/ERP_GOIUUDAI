import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { GenericStatus } from '@prisma/client';
import { AuditAction, AuditRead } from '../../common/audit/audit.decorators';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { RecruitmentPipelineQueryDto } from './dto/recruitment-pipeline-query.dto';
import { HrService } from './hr.service';

@Controller('hr')
export class HrController {
  constructor(@Inject(HrService) private readonly hrService: HrService) {}

  @Get('employees')
  listEmployees(@Query() query: PaginationQueryDto) {
    return this.hrService.listEmployees(query);
  }

  @Post('employees')
  createEmployee(@Body() body: Record<string, unknown>) {
    return this.hrService.createEmployee(body);
  }

  @Patch('employees/:id')
  updateEmployee(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.updateEmployee(id, body);
  }

  @Delete('employees/:id')
  @AuditAction({ action: 'ARCHIVE_EMPLOYEE', entityType: 'Employee', entityIdParam: 'id' })
  archiveEmployee(@Param('id') id: string) {
    return this.hrService.archiveEmployee(id);
  }

  @Get('departments')
  listDepartments(@Query() query: PaginationQueryDto) {
    return this.hrService.listDepartments(query);
  }

  @Post('departments')
  createDepartment(@Body() body: Record<string, unknown>) {
    return this.hrService.createDepartment(body);
  }

  @Patch('departments/:id')
  updateDepartment(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.updateDepartment(id, body);
  }

  @Get('positions')
  listPositions(@Query() query: PaginationQueryDto, @Query('departmentId') departmentId?: string) {
    return this.hrService.listPositions(query, departmentId);
  }

  @Post('positions')
  createPosition(@Body() body: Record<string, unknown>) {
    return this.hrService.createPosition(body);
  }

  @Patch('positions/:id')
  updatePosition(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.updatePosition(id, body);
  }

  @Get('work-shifts')
  listWorkShifts(@Query() query: PaginationQueryDto) {
    return this.hrService.listWorkShifts(query);
  }

  @Post('work-shifts')
  createWorkShift(@Body() body: Record<string, unknown>) {
    return this.hrService.createWorkShift(body);
  }

  @Patch('work-shifts/:id')
  updateWorkShift(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.updateWorkShift(id, body);
  }

  @Get('leave-policies')
  listLeavePolicies(@Query() query: PaginationQueryDto) {
    return this.hrService.listLeavePolicies(query);
  }

  @Post('leave-policies')
  createLeavePolicy(@Body() body: Record<string, unknown>) {
    return this.hrService.createLeavePolicy(body);
  }

  @Patch('leave-policies/:id')
  updateLeavePolicy(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.updateLeavePolicy(id, body);
  }

  @Get('contracts')
  listContracts(@Query() query: PaginationQueryDto, @Query('employeeId') employeeId?: string) {
    return this.hrService.listEmployeeContracts(query, employeeId);
  }

  @Post('contracts')
  createContract(@Body() body: Record<string, unknown>) {
    return this.hrService.createEmployeeContract(body);
  }

  @Patch('contracts/:id')
  updateContract(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.updateEmployeeContract(id, body);
  }

  @Get('payroll-components')
  listPayrollComponents(@Query() query: PaginationQueryDto) {
    return this.hrService.listPayrollComponents(query);
  }

  @Post('payroll-components')
  createPayrollComponent(@Body() body: Record<string, unknown>) {
    return this.hrService.createPayrollComponent(body);
  }

  @Patch('payroll-components/:id')
  updatePayrollComponent(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.updatePayrollComponent(id, body);
  }

  @Delete('payroll-components/:id')
  @AuditAction({ action: 'ARCHIVE_PAYROLL_COMPONENT', entityType: 'PayrollComponent', entityIdParam: 'id' })
  archivePayrollComponent(@Param('id') id: string) {
    return this.hrService.archivePayrollComponent(id);
  }

  @Get('attendance')
  listAttendance(
    @Query() query: PaginationQueryDto,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('date') date?: string
  ) {
    return this.hrService.listAttendance(query, employeeId, status, date);
  }

  @Get('attendance/monthly')
  getAttendanceMonthly(@Query('year') year?: string, @Query('month') month?: string) {
    return this.hrService.getAttendanceMonthly(year, month);
  }

  @Post('attendance/exempt-day')
  markAttendanceExemptDay(@Body() body: Record<string, unknown>) {
    return this.hrService.markAttendanceExemptDay(body);
  }

  @Delete('attendance/exempt-day')
  unmarkAttendanceExemptDay(@Query('employeeId') employeeId?: string, @Query('workDate') workDate?: string) {
    return this.hrService.unmarkAttendanceExemptDay(employeeId, workDate);
  }

  @Post('attendance/office-import')
  importOfficeAttendance(@Body() body: Record<string, unknown>) {
    return this.hrService.importOfficeAttendance(body);
  }

  @Post('attendance/check-in')
  checkIn(@Body() body: Record<string, unknown>) {
    return this.hrService.checkIn(body);
  }

  @Post('attendance/check-out')
  checkOut(@Body() body: Record<string, unknown>) {
    return this.hrService.checkOut(body);
  }

  @Get('leave-requests')
  listLeaveRequests(
    @Query() query: PaginationQueryDto,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: GenericStatus
  ) {
    return this.hrService.listLeaveRequests(query, employeeId, status);
  }

  @Post('leave-requests')
  createLeaveRequest(@Body() body: Record<string, unknown>) {
    return this.hrService.createLeaveRequest(body);
  }

  @Post('leave-requests/:id/approve')
  @AuditAction({ action: 'APPROVE_LEAVE_REQUEST', entityType: 'LeaveRequest', entityIdParam: 'id' })
  approveLeaveRequest(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.approveLeaveRequest(id, body.approverId ? String(body.approverId) : undefined);
  }

  @Post('leave-requests/:id/reject')
  @AuditAction({ action: 'REJECT_LEAVE_REQUEST', entityType: 'LeaveRequest', entityIdParam: 'id' })
  rejectLeaveRequest(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.rejectLeaveRequest(id, body.approverId ? String(body.approverId) : undefined);
  }

  @Get('employees/:id/leave-balance')
  @AuditRead({ action: 'READ_EMPLOYEE_LEAVE_BALANCE', entityType: 'Employee', entityIdParam: 'id' })
  getLeaveBalance(@Param('id') employeeId: string, @Query('year') year?: string) {
    return this.hrService.getLeaveBalance(employeeId, year ? Number(year) : undefined);
  }

  @Get('payrolls')
  listPayrolls(
    @Query() query: PaginationQueryDto,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('employeeId') employeeId?: string
  ) {
    return this.hrService.listPayrolls(query, month, year, employeeId);
  }

  @Post('payrolls/generate')
  generatePayroll(@Body() body: Record<string, unknown>) {
    return this.hrService.generatePayroll(body);
  }

  @Get('payrolls/:id/lines')
  listPayrollLines(@Param('id') id: string) {
    return this.hrService.listPayrollLineItems(id);
  }

  @Post('payrolls/:id/pay')
  @AuditAction({ action: 'PAY_PAYROLL', entityType: 'Payroll', entityIdParam: 'id' })
  payPayroll(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.payPayroll(id, body?.approverId ? String(body.approverId) : undefined);
  }

  @Delete('payrolls/:id')
  @AuditAction({ action: 'ARCHIVE_PAYROLL', entityType: 'Payroll', entityIdParam: 'id' })
  archivePayroll(@Param('id') id: string) {
    return this.hrService.archivePayroll(id);
  }

  @Get('recruitment')
  listRecruitment(@Query() query: PaginationQueryDto) {
    return this.hrService.listRecruitment(query);
  }

  @Get('recruitment/pipeline')
  getRecruitmentPipeline(
    @Query() query: RecruitmentPipelineQueryDto,
    @Query('stage') stage?: string,
    @Query('status') status?: string,
    @Query('requisitionId') requisitionId?: string,
    @Query('recruiterId') recruiterId?: string,
    @Query('source') source?: string
  ) {
    return this.hrService.getRecruitmentPipeline(query, {
      stage,
      status,
      requisitionId,
      recruiterId,
      source
    });
  }

  @Get('recruitment/metrics')
  getRecruitmentMetrics(
    @Query('status') status?: string,
    @Query('recruiterId') recruiterId?: string,
    @Query('requisitionId') requisitionId?: string
  ) {
    return this.hrService.getRecruitmentMetrics({
      status,
      recruiterId,
      requisitionId
    });
  }

  @Get('recruitment/applications/:id')
  getRecruitmentApplicationDetail(@Param('id') id: string) {
    return this.hrService.getRecruitmentApplicationDetail(id);
  }

  @Post('recruitment/applications')
  createRecruitmentApplication(@Body() body: Record<string, unknown>) {
    return this.hrService.createRecruitmentApplication(body);
  }

  @Patch('recruitment/applications/:id/stage')
  @AuditAction({ action: 'UPDATE_RECRUITMENT_STAGE', entityType: 'RecruitmentApplication', entityIdParam: 'id' })
  updateRecruitmentApplicationStage(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.updateRecruitmentApplicationStage(id, body);
  }

  @Patch('recruitment/applications/:id/status')
  @AuditAction({ action: 'UPDATE_RECRUITMENT_STATUS', entityType: 'RecruitmentApplication', entityIdParam: 'id' })
  updateRecruitmentApplicationStatus(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.updateRecruitmentApplicationStatus(id, body);
  }

  @Post('recruitment/interviews')
  createRecruitmentInterview(@Body() body: Record<string, unknown>) {
    return this.hrService.createRecruitmentInterview(body);
  }

  @Patch('recruitment/interviews/:id')
  updateRecruitmentInterview(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.updateRecruitmentInterview(id, body);
  }

  @Post('recruitment/offers')
  createRecruitmentOffer(@Body() body: Record<string, unknown>) {
    return this.hrService.createRecruitmentOffer(body);
  }

  @Patch('recruitment/offers/:id')
  updateRecruitmentOffer(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.updateRecruitmentOffer(id, body);
  }

  @Post('recruitment/offers/:id/submit-approval')
  @AuditAction({ action: 'SUBMIT_RECRUITMENT_OFFER_APPROVAL', entityType: 'RecruitmentOffer', entityIdParam: 'id' })
  submitRecruitmentOfferApproval(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.submitRecruitmentOfferApproval(id, body);
  }

  @Post('recruitment/applications/:id/convert-to-employee')
  @AuditAction({ action: 'CONVERT_RECRUITMENT_TO_EMPLOYEE', entityType: 'RecruitmentApplication', entityIdParam: 'id' })
  convertRecruitmentApplicationToEmployee(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.convertRecruitmentApplicationToEmployee(id, body);
  }

  @Post('recruitment')
  createRecruitment(@Body() body: Record<string, unknown>) {
    return this.hrService.createRecruitment(body);
  }

  @Patch('recruitment/:id')
  updateRecruitment(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.updateRecruitment(id, body);
  }

  @Delete('recruitment/:id')
  @AuditAction({ action: 'ARCHIVE_RECRUITMENT', entityType: 'Recruitment', entityIdParam: 'id' })
  archiveRecruitment(@Param('id') id: string) {
    return this.hrService.archiveRecruitment(id);
  }

  @Get('training')
  listTraining(@Query() query: PaginationQueryDto) {
    return this.hrService.listTraining(query);
  }

  @Post('training')
  createTraining(@Body() body: Record<string, unknown>) {
    return this.hrService.createTraining(body);
  }

  @Patch('training/:id')
  updateTraining(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.updateTraining(id, body);
  }

  @Get('performance')
  listPerformance(@Query() query: PaginationQueryDto) {
    return this.hrService.listPerformance(query);
  }

  @Post('performance')
  createPerformance(@Body() body: Record<string, unknown>) {
    return this.hrService.createPerformance(body);
  }

  @Patch('performance/:id')
  updatePerformance(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.updatePerformance(id, body);
  }

  @Get('benefits')
  listBenefits(@Query() query: PaginationQueryDto) {
    return this.hrService.listBenefits(query);
  }

  @Post('benefits')
  createBenefits(@Body() body: Record<string, unknown>) {
    return this.hrService.createBenefit(body);
  }

  @Patch('benefits/:id')
  updateBenefit(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.updateBenefit(id, body);
  }

  @Get('personal-income-tax/profiles')
  listPersonalIncomeTaxProfiles(
    @Query() query: PaginationQueryDto,
    @Query('employeeId') employeeId?: string
  ) {
    return this.hrService.listPersonalIncomeTaxProfiles(query, employeeId);
  }

  @Post('personal-income-tax/profiles')
  createPersonalIncomeTaxProfile(@Body() body: Record<string, unknown>) {
    return this.hrService.createPersonalIncomeTaxProfile(body);
  }

  @Patch('personal-income-tax/profiles/:id')
  updatePersonalIncomeTaxProfile(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.updatePersonalIncomeTaxProfile(id, body);
  }

  @Get('personal-income-tax/records')
  listPersonalIncomeTaxRecords(
    @Query() query: PaginationQueryDto,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('employeeId') employeeId?: string
  ) {
    return this.hrService.listPersonalIncomeTaxRecords(query, month, year, employeeId);
  }

  @Post('personal-income-tax/records')
  createPersonalIncomeTaxRecord(@Body() body: Record<string, unknown>) {
    return this.hrService.createPersonalIncomeTaxRecord(body);
  }

  @Patch('personal-income-tax/records/:id')
  updatePersonalIncomeTaxRecord(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.updatePersonalIncomeTaxRecord(id, body);
  }

  @Post('personal-income-tax/records/generate')
  generatePersonalIncomeTaxRecords(@Body() body: Record<string, unknown>) {
    return this.hrService.generatePersonalIncomeTaxRecords(body);
  }

  @Get('goals')
  listGoals(
    @Query() query: PaginationQueryDto,
    @Query('employeeId') employeeId?: string,
    @Query('period') period?: string,
    @Query('status') status?: GenericStatus
  ) {
    return this.hrService.listGoals(query, employeeId, period, status);
  }

  @Get('goals/tracker')
  getGoalsTracker(
    @Query() query: PaginationQueryDto,
    @Query('scope') scope?: string,
    @Query('employeeId') employeeId?: string,
    @Query('period') period?: string,
    @Query('status') status?: GenericStatus,
    @Query('trackingMode') trackingMode?: string,
    @Query('departmentId') departmentId?: string,
    @Query('orgUnitId') orgUnitId?: string
  ) {
    return this.hrService.getGoalsTracker(query, {
      scope,
      employeeId,
      period,
      status,
      trackingMode,
      departmentId,
      orgUnitId
    });
  }

  @Get('goals/overview')
  getGoalsOverview(
    @Query() query: PaginationQueryDto,
    @Query('scope') scope?: string,
    @Query('employeeId') employeeId?: string,
    @Query('period') period?: string,
    @Query('status') status?: GenericStatus,
    @Query('trackingMode') trackingMode?: string,
    @Query('departmentId') departmentId?: string,
    @Query('orgUnitId') orgUnitId?: string
  ) {
    return this.hrService.getGoalsOverview(query, {
      scope,
      employeeId,
      period,
      status,
      trackingMode,
      departmentId,
      orgUnitId
    });
  }

  @Post('goals')
  createGoal(@Body() body: Record<string, unknown>) {
    return this.hrService.createGoal(body);
  }

  @Patch('goals/:id')
  updateGoal(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.updateGoal(id, body);
  }

  @Patch('goals/:id/progress')
  updateGoalProgress(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.updateGoalProgress(id, body);
  }

  @Get('goals/:id/timeline')
  getGoalTimeline(@Param('id') id: string) {
    return this.hrService.getGoalTimeline(id);
  }

  @Post('goals/:id/submit-approval')
  submitGoalApproval(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.submitGoalApproval(id, body);
  }

  @Post('goals/:id/recompute-auto')
  recomputeGoalAuto(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.recomputeGoalAuto(id, body);
  }

  @Post('goals/recompute-auto')
  recomputeGoalsAuto(@Body() body: Record<string, unknown>) {
    return this.hrService.recomputeGoalsAuto(body);
  }

  @Get('employee-info')
  listEmployeeInfo(@Query() query: PaginationQueryDto) {
    return this.hrService.listEmployeeInfo(query);
  }

  @Get('employee-info/:id')
  getEmployeeInfo(@Param('id') id: string) {
    return this.hrService.getEmployeeInfo(id);
  }

  @Patch('employee-info/:id')
  updateEmployeeInfo(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.updateEmployeeInfo(id, body);
  }

  @Get('events')
  listEvents(@Query() query: PaginationQueryDto, @Query('employeeId') employeeId?: string) {
    return this.hrService.listEmployeeEvents(query, employeeId);
  }

  @Post('employees/:id/events')
  createEvent(@Param('id') employeeId: string, @Body() body: Record<string, unknown>) {
    return this.hrService.createEmployeeEvent(employeeId, body);
  }
}
