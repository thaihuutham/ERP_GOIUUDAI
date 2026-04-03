import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { HrRegulationService } from './hr-regulation.service';

@Controller('hr')
export class HrRegulationController {
  constructor(@Inject(HrRegulationService) private readonly regulationService: HrRegulationService) {}

  @Get('regulation/metadata')
  getRegulationMetadata() {
    return this.regulationService.getRegulationMetadata();
  }

  @Get('appendix/templates')
  listAppendixTemplates(
    @Query() query: PaginationQueryDto,
    @Query('appendixCode') appendixCode?: string,
    @Query('status') status?: string
  ) {
    return this.regulationService.listAppendixTemplates(query, appendixCode, status);
  }

  @Patch('appendix/templates')
  patchAppendixTemplate(@Body() body: Record<string, unknown>) {
    return this.regulationService.patchAppendixTemplate(body);
  }

  @Get('appendix/submissions')
  listAppendixSubmissions(@Query() query: PaginationQueryDto, @Query() filters: Record<string, unknown>) {
    return this.regulationService.listAppendixSubmissions(query, filters);
  }

  @Post('appendix/submissions')
  createAppendixSubmission(@Body() body: Record<string, unknown>) {
    return this.regulationService.createAppendixSubmission(body);
  }

  @Patch('appendix/submissions/:id')
  patchAppendixSubmission(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.regulationService.patchAppendixSubmission(id, body);
  }

  @Post('appendix/submissions/:id/submit')
  submitAppendixSubmission(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.regulationService.submitAppendixSubmission(id, body);
  }

  @Post('appendix/submissions/:id/approve')
  approveAppendixSubmission(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.regulationService.approveAppendixSubmission(id, body);
  }

  @Post('appendix/submissions/:id/reject')
  rejectAppendixSubmission(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.regulationService.rejectAppendixSubmission(id, body);
  }

  @Post('appendix/submissions/:id/revisions')
  createAppendixRevision(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.regulationService.createAppendixRevision(id, body);
  }

  @Post('appendix/revisions/:id/approve')
  approveAppendixRevision(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.regulationService.approveAppendixRevision(id, body);
  }

  @Post('appendix/revisions/:id/reject')
  rejectAppendixRevision(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.regulationService.rejectAppendixRevision(id, body);
  }

  @Get('performance/daily-scores')
  listDailyScores(@Query() query: PaginationQueryDto, @Query() filters: Record<string, unknown>) {
    return this.regulationService.listDailyScores(query, filters);
  }

  @Post('performance/daily-scores/recompute')
  recomputeDailyScores(@Body() body: Record<string, unknown>) {
    return this.regulationService.recomputeDailyScores(body);
  }

  @Post('performance/daily-scores/reconcile/run')
  runDailyScoreReconcile(@Body() body: Record<string, unknown>) {
    return this.regulationService.reconcileDailyScores(body);
  }

  @Get('performance/role-templates')
  listScoreRoleTemplates() {
    return this.regulationService.listScoreRoleTemplates();
  }

  @Patch('performance/role-templates/:roleGroup')
  patchScoreRoleTemplate(@Param('roleGroup') roleGroup: string, @Body() body: Record<string, unknown>) {
    return this.regulationService.patchScoreRoleTemplate(roleGroup, body);
  }

  @Get('pip/cases')
  listPipCases(
    @Query() query: PaginationQueryDto,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string
  ) {
    return this.regulationService.listPipCases(query, employeeId, status);
  }

  @Post('pip/cases')
  createPipCase(@Body() body: Record<string, unknown>) {
    return this.regulationService.createPipCase(body);
  }

  @Patch('pip/cases/:id')
  patchPipCase(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.regulationService.patchPipCase(id, body);
  }

  @Post('pip/cases/auto-draft/run')
  runAutoDraftPip(@Body() body: Record<string, unknown>) {
    return this.regulationService.runAutoDraftPip(body);
  }
}
