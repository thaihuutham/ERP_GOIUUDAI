import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { CustomFieldEntityType, UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/auth.decorators';
import { AuditAction, AuditRead } from '../../common/audit/audit.decorators';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import {
  ArchiveProductDto,
  CatalogListQueryDto,
  CreateProductDto,
  ImportProductsDto,
  SetPricePolicyDto,
  UpdateProductDto
} from './dto/catalog.dto';
import { CatalogService } from './catalog.service';

@Controller('catalog/products')
export class CatalogController {
  constructor(
    @Inject(CatalogService) private readonly catalogService: CatalogService,
    @Inject(CustomFieldsService) private readonly customFields: CustomFieldsService
  ) {}

  @Get()
  @Roles(UserRole.USER, UserRole.ADMIN)
  async list(@Query() query: CatalogListQueryDto, @Req() req?: { query?: Record<string, unknown> }) {
    const entityIds = await this.customFields.resolveEntityIdsByQuery(CustomFieldEntityType.PRODUCT, req?.query);
    const result = await this.catalogService.listProducts(query, entityIds);
    return this.customFields.wrapResult(CustomFieldEntityType.PRODUCT, result);
  }

  @Get(':id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @AuditRead({ action: 'READ_PRODUCT_DETAIL', entityType: 'Product', entityIdParam: 'id' })
  async getDetail(@Param('id') id: string) {
    const product = await this.catalogService.getProduct(id);
    return this.customFields.wrapEntity(CustomFieldEntityType.PRODUCT, product);
  }

  @Get(':id/variants')
  @Roles(UserRole.USER, UserRole.ADMIN)
  listVariants(@Param('id') id: string) {
    return this.catalogService.listVariants(id);
  }

  @Post()
  @Roles(UserRole.USER, UserRole.ADMIN)
  @AuditAction({ action: 'CREATE_PRODUCT', entityType: 'Product' })
  async create(@Body() body: Record<string, unknown>) {
    const mutation = this.customFields.parseMutationBody(body);
    const created = await this.catalogService.createProduct(mutation.base as unknown as CreateProductDto);
    await this.customFields.applyEntityMutation(CustomFieldEntityType.PRODUCT, (created as Record<string, unknown>)?.id, mutation);
    return this.customFields.wrapEntity(CustomFieldEntityType.PRODUCT, created);
  }

  @Patch(':id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @AuditAction({ action: 'UPDATE_PRODUCT', entityType: 'Product', entityIdParam: 'id' })
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const mutation = this.customFields.parseMutationBody(body);
    const product = await this.catalogService.updateProduct(id, mutation.base as unknown as UpdateProductDto);
    await this.customFields.applyEntityMutation(CustomFieldEntityType.PRODUCT, id, mutation);
    return this.customFields.wrapEntity(CustomFieldEntityType.PRODUCT, product);
  }

  @Post(':id/archive')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @AuditAction({ action: 'ARCHIVE_PRODUCT', entityType: 'Product', entityIdParam: 'id' })
  async archive(@Param('id') id: string, @Body() body: ArchiveProductDto) {
    const product = await this.catalogService.archiveProduct(id, body);
    return this.customFields.wrapEntity(CustomFieldEntityType.PRODUCT, product);
  }

  @Post(':id/price-policy')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @AuditAction({ action: 'SET_PRODUCT_PRICE_POLICY', entityType: 'Product', entityIdParam: 'id' })
  async setPricePolicy(@Param('id') id: string, @Body() body: SetPricePolicyDto) {
    const product = await this.catalogService.setPricePolicy(id, body);
    return this.customFields.wrapEntity(CustomFieldEntityType.PRODUCT, product);
  }

  @Post('import')
  @Roles(UserRole.ADMIN)
  @AuditAction({ action: 'IMPORT_PRODUCTS', entityType: 'Product' })
  importProducts(@Body() body: ImportProductsDto) {
    return this.catalogService.importProducts(body as unknown as Record<string, unknown>);
  }
}
