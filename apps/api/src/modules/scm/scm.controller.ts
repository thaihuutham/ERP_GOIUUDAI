import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { CustomFieldEntityType, UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/auth.decorators';
import { AuditAction } from '../../common/audit/audit.decorators';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
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
  constructor(
    @Inject(ScmService) private readonly scmService: ScmService,
    @Inject(CustomFieldsService) private readonly customFields: CustomFieldsService
  ) {}

  @Get('vendors')
  @Roles(UserRole.USER, UserRole.ADMIN)
  listVendors(@Query() query: ScmListQueryDto) {
    return this.scmService.listVendors(query);
  }

  @Post('vendors')
  @Roles(UserRole.USER, UserRole.ADMIN)
  createVendor(@Body() body: CreateVendorDto) {
    return this.scmService.createVendor(body);
  }

  @Patch('vendors/:id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  updateVendor(@Param('id') id: string, @Body() body: UpdateVendorDto) {
    return this.scmService.updateVendor(id, body);
  }

  @Get('purchase-orders')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async listPurchaseOrders(@Query() query: ScmListQueryDto, @Req() req?: { query?: Record<string, unknown> }) {
    const entityIds = await this.customFields.resolveEntityIdsByQuery(CustomFieldEntityType.PURCHASE_ORDER, req?.query);
    const result = await this.scmService.listPurchaseOrders(query, entityIds);
    return this.customFields.wrapResult(CustomFieldEntityType.PURCHASE_ORDER, result);
  }

  @Post('purchase-orders')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @AuditAction({ action: 'CREATE_PURCHASE_ORDER', entityType: 'PurchaseOrder' })
  async createPurchaseOrder(@Body() body: Record<string, unknown>) {
    const mutation = this.customFields.parseMutationBody(body);
    const purchaseOrder = await this.scmService.createPurchaseOrder(mutation.base as unknown as CreatePurchaseOrderDto);
    await this.customFields.applyEntityMutation(CustomFieldEntityType.PURCHASE_ORDER, (purchaseOrder as Record<string, unknown>)?.id, mutation);
    return this.customFields.wrapEntity(CustomFieldEntityType.PURCHASE_ORDER, purchaseOrder);
  }

  @Patch('purchase-orders/:id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @AuditAction({ action: 'UPDATE_PURCHASE_ORDER', entityType: 'PurchaseOrder', entityIdParam: 'id' })
  async updatePurchaseOrder(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const mutation = this.customFields.parseMutationBody(body);
    const purchaseOrder = await this.scmService.updatePurchaseOrder(id, mutation.base as unknown as UpdatePurchaseOrderDto);
    await this.customFields.applyEntityMutation(CustomFieldEntityType.PURCHASE_ORDER, id, mutation);
    return this.customFields.wrapEntity(CustomFieldEntityType.PURCHASE_ORDER, purchaseOrder);
  }

  @Post('purchase-orders/:id/submit')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @AuditAction({ action: 'SUBMIT_PURCHASE_ORDER', entityType: 'PurchaseOrder', entityIdParam: 'id' })
  async submitPurchaseOrder(@Param('id') id: string, @Body() body: PoTransitionDto) {
    const purchaseOrder = await this.scmService.submitPurchaseOrder(id, body);
    return this.customFields.wrapEntity(CustomFieldEntityType.PURCHASE_ORDER, purchaseOrder);
  }

  @Post('purchase-orders/:id/approve')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @AuditAction({ action: 'APPROVE_PURCHASE_ORDER', entityType: 'PurchaseOrder', entityIdParam: 'id' })
  async approvePurchaseOrder(@Param('id') id: string, @Body() body: PoTransitionDto) {
    const purchaseOrder = await this.scmService.approvePurchaseOrder(id, body);
    return this.customFields.wrapEntity(CustomFieldEntityType.PURCHASE_ORDER, purchaseOrder);
  }

  @Post('purchase-orders/:id/cancel')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @AuditAction({ action: 'CANCEL_PURCHASE_ORDER', entityType: 'PurchaseOrder', entityIdParam: 'id' })
  async cancelPurchaseOrder(@Param('id') id: string, @Body() body: PoTransitionDto) {
    const purchaseOrder = await this.scmService.cancelPurchaseOrder(id, body);
    return this.customFields.wrapEntity(CustomFieldEntityType.PURCHASE_ORDER, purchaseOrder);
  }

  @Post('purchase-orders/:id/close')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @AuditAction({ action: 'CLOSE_PURCHASE_ORDER', entityType: 'PurchaseOrder', entityIdParam: 'id' })
  async closePurchaseOrder(@Param('id') id: string, @Body() body: PoTransitionDto) {
    const purchaseOrder = await this.scmService.closePurchaseOrder(id, body);
    return this.customFields.wrapEntity(CustomFieldEntityType.PURCHASE_ORDER, purchaseOrder);
  }

  @Get('purchase-orders/:id/receipts')
  @Roles(UserRole.USER, UserRole.ADMIN)
  listPurchaseReceipts(@Param('id') id: string) {
    return this.scmService.listPurchaseReceipts(id);
  }

  @Post('purchase-orders/:id/receive')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @AuditAction({ action: 'RECEIVE_PURCHASE_ORDER', entityType: 'PurchaseOrder', entityIdParam: 'id' })
  receivePurchaseOrder(@Param('id') id: string, @Body() body: CreatePurchaseReceiptDto) {
    return this.scmService.receivePurchaseOrder(id, body);
  }

  @Get('purchase-orders/:id/three-way-match')
  @Roles(UserRole.USER, UserRole.ADMIN)
  getPurchaseOrderThreeWayMatch(@Param('id') id: string) {
    return this.scmService.getPurchaseOrderThreeWayMatch(id);
  }

  @Get('shipments')
  @Roles(UserRole.USER, UserRole.ADMIN)
  listShipments(@Query() query: ScmListQueryDto) {
    return this.scmService.listShipments(query);
  }

  @Post('shipments')
  @Roles(UserRole.USER, UserRole.ADMIN)
  createShipment(@Body() body: CreateShipmentDto) {
    return this.scmService.createShipment(body);
  }

  @Patch('shipments/:id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  updateShipment(@Param('id') id: string, @Body() body: UpdateShipmentDto) {
    return this.scmService.updateShipment(id, body);
  }

  @Post('shipments/:id/ship')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @AuditAction({ action: 'SHIP_SHIPMENT', entityType: 'Shipment', entityIdParam: 'id' })
  shipShipment(@Param('id') id: string, @Body() body: PoTransitionDto) {
    return this.scmService.shipShipment(id, body);
  }

  @Post('shipments/:id/deliver')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @AuditAction({ action: 'DELIVER_SHIPMENT', entityType: 'Shipment', entityIdParam: 'id' })
  deliverShipment(@Param('id') id: string, @Body() body: PoTransitionDto) {
    return this.scmService.deliverShipment(id, body);
  }

  @Get('vendor-scorecards')
  @Roles(UserRole.USER, UserRole.ADMIN)
  getVendorScorecards(@Query() query: VendorScorecardQueryDto) {
    return this.scmService.getVendorScorecards(query);
  }

  @Get('distributions')
  @Roles(UserRole.USER, UserRole.ADMIN)
  listDistributions(@Query() query: ScmListQueryDto) {
    return this.scmService.listDistributions(query);
  }

  @Post('distributions')
  @Roles(UserRole.USER, UserRole.ADMIN)
  createDistribution(@Body() body: CreateDistributionDto) {
    return this.scmService.createDistribution(body);
  }

  @Patch('distributions/:id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  updateDistribution(@Param('id') id: string, @Body() body: UpdateDistributionDto) {
    return this.scmService.updateDistribution(id, body);
  }

  @Get('demand-forecasts')
  @Roles(UserRole.USER, UserRole.ADMIN)
  listDemandForecasts(@Query() query: ScmListQueryDto) {
    return this.scmService.listDemandForecasts(query);
  }

  @Post('demand-forecasts')
  @Roles(UserRole.USER, UserRole.ADMIN)
  createDemandForecast(@Body() body: CreateDemandForecastDto) {
    return this.scmService.createDemandForecast(body);
  }

  @Patch('demand-forecasts/:id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  updateDemandForecast(@Param('id') id: string, @Body() body: UpdateDemandForecastDto) {
    return this.scmService.updateDemandForecast(id, body);
  }

  @Get('supply-chain-risks')
  @Roles(UserRole.USER, UserRole.ADMIN)
  listSupplyChainRisks(@Query() query: ScmListQueryDto) {
    return this.scmService.listSupplyChainRisks(query);
  }

  @Post('supply-chain-risks')
  @Roles(UserRole.USER, UserRole.ADMIN)
  createSupplyChainRisk(@Body() body: CreateSupplyChainRiskDto) {
    return this.scmService.createSupplyChainRisk(body);
  }

  @Patch('supply-chain-risks/:id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  updateSupplyChainRisk(@Param('id') id: string, @Body() body: UpdateSupplyChainRiskDto) {
    return this.scmService.updateSupplyChainRisk(id, body);
  }
}
