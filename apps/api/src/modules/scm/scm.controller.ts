import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/auth.decorators';
import { AuditAction } from '../../common/audit/audit.decorators';
import {
  CreateDemandForecastDto,
  CreateDistributionDto,
  CreatePurchaseOrderDto,
  CreatePurchaseReceiptDto,
  CreateShipmentDto,
  CreateSupplyChainRiskDto,
  CreateVendorDto,
  PoTransitionDto,
  ScmListQueryDto,
  UpdateDemandForecastDto,
  UpdateDistributionDto,
  UpdatePurchaseOrderDto,
  UpdateShipmentDto,
  UpdateSupplyChainRiskDto,
  UpdateVendorDto,
  VendorScorecardQueryDto
} from './dto/scm.dto';
import { ScmService } from './scm.service';

@Controller('scm')
export class ScmController {
  constructor(@Inject(ScmService) private readonly scmService: ScmService) {}

  @Get('vendors')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listVendors(@Query() query: ScmListQueryDto) {
    return this.scmService.listVendors(query);
  }

  @Post('vendors')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  createVendor(@Body() body: CreateVendorDto) {
    return this.scmService.createVendor(body);
  }

  @Patch('vendors/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  updateVendor(@Param('id') id: string, @Body() body: UpdateVendorDto) {
    return this.scmService.updateVendor(id, body);
  }

  @Get('purchase-orders')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listPurchaseOrders(@Query() query: ScmListQueryDto) {
    return this.scmService.listPurchaseOrders(query);
  }

  @Post('purchase-orders')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'CREATE_PURCHASE_ORDER', entityType: 'PurchaseOrder' })
  createPurchaseOrder(@Body() body: CreatePurchaseOrderDto) {
    return this.scmService.createPurchaseOrder(body);
  }

  @Patch('purchase-orders/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'UPDATE_PURCHASE_ORDER', entityType: 'PurchaseOrder', entityIdParam: 'id' })
  updatePurchaseOrder(@Param('id') id: string, @Body() body: UpdatePurchaseOrderDto) {
    return this.scmService.updatePurchaseOrder(id, body);
  }

  @Post('purchase-orders/:id/submit')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'SUBMIT_PURCHASE_ORDER', entityType: 'PurchaseOrder', entityIdParam: 'id' })
  submitPurchaseOrder(@Param('id') id: string, @Body() body: PoTransitionDto) {
    return this.scmService.submitPurchaseOrder(id, body);
  }

  @Post('purchase-orders/:id/approve')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'APPROVE_PURCHASE_ORDER', entityType: 'PurchaseOrder', entityIdParam: 'id' })
  approvePurchaseOrder(@Param('id') id: string, @Body() body: PoTransitionDto) {
    return this.scmService.approvePurchaseOrder(id, body);
  }

  @Post('purchase-orders/:id/cancel')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'CANCEL_PURCHASE_ORDER', entityType: 'PurchaseOrder', entityIdParam: 'id' })
  cancelPurchaseOrder(@Param('id') id: string, @Body() body: PoTransitionDto) {
    return this.scmService.cancelPurchaseOrder(id, body);
  }

  @Post('purchase-orders/:id/close')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'CLOSE_PURCHASE_ORDER', entityType: 'PurchaseOrder', entityIdParam: 'id' })
  closePurchaseOrder(@Param('id') id: string, @Body() body: PoTransitionDto) {
    return this.scmService.closePurchaseOrder(id, body);
  }

  @Get('purchase-orders/:id/receipts')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listPurchaseReceipts(@Param('id') id: string) {
    return this.scmService.listPurchaseReceipts(id);
  }

  @Post('purchase-orders/:id/receive')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'RECEIVE_PURCHASE_ORDER', entityType: 'PurchaseOrder', entityIdParam: 'id' })
  receivePurchaseOrder(@Param('id') id: string, @Body() body: CreatePurchaseReceiptDto) {
    return this.scmService.receivePurchaseOrder(id, body);
  }

  @Get('purchase-orders/:id/three-way-match')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  getPurchaseOrderThreeWayMatch(@Param('id') id: string) {
    return this.scmService.getPurchaseOrderThreeWayMatch(id);
  }

  @Get('shipments')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listShipments(@Query() query: ScmListQueryDto) {
    return this.scmService.listShipments(query);
  }

  @Post('shipments')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  createShipment(@Body() body: CreateShipmentDto) {
    return this.scmService.createShipment(body);
  }

  @Patch('shipments/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  updateShipment(@Param('id') id: string, @Body() body: UpdateShipmentDto) {
    return this.scmService.updateShipment(id, body);
  }

  @Post('shipments/:id/ship')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'SHIP_SHIPMENT', entityType: 'Shipment', entityIdParam: 'id' })
  shipShipment(@Param('id') id: string, @Body() body: PoTransitionDto) {
    return this.scmService.shipShipment(id, body);
  }

  @Post('shipments/:id/deliver')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'DELIVER_SHIPMENT', entityType: 'Shipment', entityIdParam: 'id' })
  deliverShipment(@Param('id') id: string, @Body() body: PoTransitionDto) {
    return this.scmService.deliverShipment(id, body);
  }

  @Get('vendor-scorecards')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  getVendorScorecards(@Query() query: VendorScorecardQueryDto) {
    return this.scmService.getVendorScorecards(query);
  }

  @Get('distributions')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listDistributions(@Query() query: ScmListQueryDto) {
    return this.scmService.listDistributions(query);
  }

  @Post('distributions')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  createDistribution(@Body() body: CreateDistributionDto) {
    return this.scmService.createDistribution(body);
  }

  @Patch('distributions/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  updateDistribution(@Param('id') id: string, @Body() body: UpdateDistributionDto) {
    return this.scmService.updateDistribution(id, body);
  }

  @Get('demand-forecasts')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listDemandForecasts(@Query() query: ScmListQueryDto) {
    return this.scmService.listDemandForecasts(query);
  }

  @Post('demand-forecasts')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  createDemandForecast(@Body() body: CreateDemandForecastDto) {
    return this.scmService.createDemandForecast(body);
  }

  @Patch('demand-forecasts/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  updateDemandForecast(@Param('id') id: string, @Body() body: UpdateDemandForecastDto) {
    return this.scmService.updateDemandForecast(id, body);
  }

  @Get('supply-chain-risks')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listSupplyChainRisks(@Query() query: ScmListQueryDto) {
    return this.scmService.listSupplyChainRisks(query);
  }

  @Post('supply-chain-risks')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  createSupplyChainRisk(@Body() body: CreateSupplyChainRiskDto) {
    return this.scmService.createSupplyChainRisk(body);
  }

  @Patch('supply-chain-risks/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  updateSupplyChainRisk(@Param('id') id: string, @Body() body: UpdateSupplyChainRiskDto) {
    return this.scmService.updateSupplyChainRisk(id, body);
  }
}
