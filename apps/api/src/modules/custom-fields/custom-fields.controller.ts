import { Body, Controller, Get, Inject, Param, Post, Put, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/auth.decorators';
import { CustomFieldsService } from './custom-fields.service';

@Controller('custom-fields')
export class CustomFieldsController {
  constructor(@Inject(CustomFieldsService) private readonly customFields: CustomFieldsService) {}

  @Get('entities/:entityType/schema')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  getSchema(@Param('entityType') entityType: string) {
    return this.customFields.getSchema(entityType);
  }

  @Put('entities/:entityType/draft')
  @Roles(UserRole.ADMIN)
  saveDraft(@Param('entityType') entityType: string, @Body() body: Record<string, unknown>) {
    return this.customFields.saveDraft(entityType, body);
  }

  @Post('entities/:entityType/publish')
  @Roles(UserRole.ADMIN)
  publish(@Param('entityType') entityType: string, @Body() body: Record<string, unknown>) {
    return this.customFields.publish(entityType, body);
  }

  @Get('entities/:entityType/history')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  history(@Param('entityType') entityType: string, @Query('limit') limit?: string) {
    return this.customFields.history(entityType, limit);
  }

  @Post('reports/query')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  queryReport(@Body() body: Record<string, unknown>) {
    return this.customFields.queryReport(body);
  }

  @Post('reports/widgets')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  saveOrQueryWidget(@Body() body: Record<string, unknown>) {
    return this.customFields.saveOrQueryWidget(body);
  }
}
