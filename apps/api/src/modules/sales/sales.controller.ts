import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { GenericStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { SalesService } from './sales.service';

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
  createOrder(@Body() body: Record<string, unknown>) {
    return this.salesService.createOrder(body);
  }

  @Patch('orders/:id')
  updateOrder(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.salesService.updateOrder(id, body);
  }

  @Get('approvals')
  listApprovals() {
    return this.salesService.listApprovals();
  }

  @Post('approvals/:id/approve')
  approve(@Param('id') id: string) {
    return this.salesService.approve(id);
  }

  @Post('approvals/:id/reject')
  reject(@Param('id') id: string) {
    return this.salesService.reject(id);
  }
}
