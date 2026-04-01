import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { GenericStatus } from '@prisma/client';
import { AuditAction } from '../../common/audit/audit.decorators';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { SalesService } from './sales.service';
import { CreateSalesOrderDto, OrderDecisionDto, UpdateSalesOrderDto } from './dto/sales.dto';

@Controller('sales')
export class SalesController {
  constructor(@Inject(SalesService) private readonly salesService: SalesService) {}

  @Get('orders')
  listOrders(
    @Query() query: PaginationQueryDto,
    @Query('status') status?: GenericStatus | 'ALL'
  ) {
    return this.salesService.listOrders(query, status);
  }

  @Post('orders')
  @AuditAction({ action: 'CREATE_ORDER', entityType: 'Order' })
  createOrder(@Body() body: CreateSalesOrderDto) {
    return this.salesService.createOrder(body);
  }

  @Patch('orders/:id')
  @AuditAction({ action: 'UPDATE_ORDER', entityType: 'Order', entityIdParam: 'id' })
  updateOrder(@Param('id') id: string, @Body() body: UpdateSalesOrderDto) {
    return this.salesService.updateOrder(id, body);
  }

  @Delete('orders/:id')
  @AuditAction({ action: 'ARCHIVE_ORDER', entityType: 'Order', entityIdParam: 'id' })
  archiveOrder(@Param('id') id: string) {
    return this.salesService.archiveOrder(id);
  }

  @Post('orders/:id/approve')
  @AuditAction({ action: 'APPROVE_ORDER', entityType: 'Order', entityIdParam: 'id' })
  approveOrder(@Param('id') id: string, @Body() body: OrderDecisionDto) {
    return this.salesService.approveOrder(id, body);
  }

  @Post('orders/:id/reject')
  @AuditAction({ action: 'REJECT_ORDER', entityType: 'Order', entityIdParam: 'id' })
  rejectOrder(@Param('id') id: string, @Body() body: OrderDecisionDto) {
    return this.salesService.rejectOrder(id, body);
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
