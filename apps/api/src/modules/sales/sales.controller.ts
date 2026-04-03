import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { CustomFieldEntityType, GenericStatus } from '@prisma/client';
import { AuditAction } from '../../common/audit/audit.decorators';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { SalesService } from './sales.service';
import { CreateSalesOrderDto, OrderDecisionDto, UpdateSalesOrderDto } from './dto/sales.dto';

@Controller('sales')
export class SalesController {
  constructor(
    @Inject(SalesService) private readonly salesService: SalesService,
    @Inject(CustomFieldsService) private readonly customFields: CustomFieldsService
  ) {}

  @Get('orders')
  async listOrders(
    @Query() query: PaginationQueryDto,
    @Query('status') status?: GenericStatus | 'ALL',
    @Req() req?: { query?: Record<string, unknown> }
  ) {
    const entityIds = await this.customFields.resolveEntityIdsByQuery(CustomFieldEntityType.SALES_ORDER, req?.query);
    const result = await this.salesService.listOrders(query, status, entityIds);
    return this.customFields.wrapResult(CustomFieldEntityType.SALES_ORDER, result);
  }

  @Post('orders')
  @AuditAction({ action: 'CREATE_ORDER', entityType: 'Order' })
  async createOrder(@Body() body: Record<string, unknown>) {
    const mutation = this.customFields.parseMutationBody(body);
    const order = await this.salesService.createOrder(mutation.base as unknown as CreateSalesOrderDto);
    await this.customFields.applyEntityMutation(CustomFieldEntityType.SALES_ORDER, (order as Record<string, unknown>)?.id, mutation);
    return this.customFields.wrapEntity(CustomFieldEntityType.SALES_ORDER, order);
  }

  @Patch('orders/:id')
  @AuditAction({ action: 'UPDATE_ORDER', entityType: 'Order', entityIdParam: 'id' })
  async updateOrder(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const mutation = this.customFields.parseMutationBody(body);
    const result = await this.salesService.updateOrder(id, mutation.base as unknown as UpdateSalesOrderDto);
    await this.customFields.applyEntityMutation(CustomFieldEntityType.SALES_ORDER, id, mutation);
    return this.customFields.wrapResult(CustomFieldEntityType.SALES_ORDER, result);
  }

  @Delete('orders/:id')
  @AuditAction({ action: 'ARCHIVE_ORDER', entityType: 'Order', entityIdParam: 'id' })
  async archiveOrder(@Param('id') id: string) {
    const order = await this.salesService.archiveOrder(id);
    return this.customFields.wrapEntity(CustomFieldEntityType.SALES_ORDER, order);
  }

  @Post('orders/:id/approve')
  @AuditAction({ action: 'APPROVE_ORDER', entityType: 'Order', entityIdParam: 'id' })
  async approveOrder(@Param('id') id: string, @Body() body: OrderDecisionDto) {
    const result = await this.salesService.approveOrder(id, body);
    return this.customFields.wrapNestedEntity(CustomFieldEntityType.SALES_ORDER, result, 'order');
  }

  @Post('orders/:id/reject')
  @AuditAction({ action: 'REJECT_ORDER', entityType: 'Order', entityIdParam: 'id' })
  async rejectOrder(@Param('id') id: string, @Body() body: OrderDecisionDto) {
    const result = await this.salesService.rejectOrder(id, body);
    return this.customFields.wrapNestedEntity(CustomFieldEntityType.SALES_ORDER, result, 'order');
  }

  @Get('approvals')
  listApprovals() {
    return this.salesService.listApprovals();
  }

  @Post('approvals/:id/approve')
  @AuditAction({ action: 'APPROVE_REQUEST', entityType: 'Approval', entityIdParam: 'id' })
  approve(@Param('id') id: string) {
    return this.salesService.approve(id);
  }

  @Post('approvals/:id/reject')
  @AuditAction({ action: 'REJECT_REQUEST', entityType: 'Approval', entityIdParam: 'id' })
  reject(@Param('id') id: string) {
    return this.salesService.reject(id);
  }
}
