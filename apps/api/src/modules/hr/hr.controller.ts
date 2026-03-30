import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { GenericStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
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

  @Get('attendance')
  listAttendance(
    @Query() query: PaginationQueryDto,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('date') date?: string
  ) {
    return this.hrService.listAttendance(query, employeeId, status, date);
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
  approveLeaveRequest(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.approveLeaveRequest(id, body.approverId ? String(body.approverId) : undefined);
  }

  @Post('leave-requests/:id/reject')
  rejectLeaveRequest(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.rejectLeaveRequest(id, body.approverId ? String(body.approverId) : undefined);
  }

  @Get('employees/:id/leave-balance')
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
  payPayroll(@Param('id') id: string) {
    return this.hrService.payPayroll(id);
  }

  @Get('recruitment')
  listRecruitment(@Query() query: PaginationQueryDto) {
    return this.hrService.listRecruitment(query);
  }

  @Post('recruitment')
  createRecruitment(@Body() body: Record<string, unknown>) {
    return this.hrService.createRecruitment(body);
  }

  @Patch('recruitment/:id')
  updateRecruitment(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.updateRecruitment(id, body);
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

  @Get('events')
  listEvents(@Query() query: PaginationQueryDto, @Query('employeeId') employeeId?: string) {
    return this.hrService.listEmployeeEvents(query, employeeId);
  }

  @Post('employees/:id/events')
  createEvent(@Param('id') employeeId: string, @Body() body: Record<string, unknown>) {
    return this.hrService.createEmployeeEvent(employeeId, body);
  }
}
