import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/auth.decorators';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  CreateReportDefinitionDto,
  GenerateReportRunDto,
  ModuleDataQueryDto,
  ReportsListQueryDto,
  RunDueSchedulesDto,
  UpdateReportDefinitionDto
} from './dto/reports.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reportsService: ReportsService) {}

  @Get('overview')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  overview() {
    return this.reportsService.overview();
  }

  @Get('module')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  moduleData(@Query() query: ModuleDataQueryDto) {
    return this.reportsService.byModule(query);
  }

  @Get()
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listDefinitions(@Query() query: ReportsListQueryDto) {
    return this.reportsService.listDefinitions(query);
  }

  @Post()
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  createReportDefinition(@Body() body: CreateReportDefinitionDto) {
    return this.reportsService.createDefinition(body);
  }

  @Post('schedules/run-due')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  runDueSchedules(@Body() body: RunDueSchedulesDto) {
    return this.reportsService.runDueSchedules(body);
  }

  @Get(':id/runs')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listRuns(@Param('id') id: string, @Query() query: PaginationQueryDto) {
    return this.reportsService.listRuns(id, query);
  }

  @Post(':id/generate')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  generate(@Param('id') id: string, @Body() body: GenerateReportRunDto) {
    return this.reportsService.generateReportRun(id, body);
  }

  @Get(':id')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  getDefinition(@Param('id') id: string) {
    return this.reportsService.getDefinition(id);
  }

  @Patch(':id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  updateDefinition(@Param('id') id: string, @Body() body: UpdateReportDefinitionDto) {
    return this.reportsService.updateDefinition(id, body);
  }
}
