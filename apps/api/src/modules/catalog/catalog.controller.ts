import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/auth.decorators';
import { AuditAction, AuditRead } from '../../common/audit/audit.decorators';
import {
  ArchiveProductDto,
  CatalogListQueryDto,
  CreateProductDto,
  SetPricePolicyDto,
  UpdateProductDto
} from './dto/catalog.dto';
import { CatalogService } from './catalog.service';

@Controller('catalog/products')
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalogService: CatalogService) {}

  @Get()
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  list(@Query() query: CatalogListQueryDto) {
    return this.catalogService.listProducts(query);
  }

  @Get(':id')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  @AuditRead({ action: 'READ_PRODUCT_DETAIL', entityType: 'Product', entityIdParam: 'id' })
  getDetail(@Param('id') id: string) {
    return this.catalogService.getProduct(id);
  }

  @Get(':id/variants')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listVariants(@Param('id') id: string) {
    return this.catalogService.listVariants(id);
  }

  @Post()
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'CREATE_PRODUCT', entityType: 'Product' })
  create(@Body() body: CreateProductDto) {
    return this.catalogService.createProduct(body);
  }

  @Patch(':id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'UPDATE_PRODUCT', entityType: 'Product', entityIdParam: 'id' })
  update(@Param('id') id: string, @Body() body: UpdateProductDto) {
    return this.catalogService.updateProduct(id, body);
  }

  @Post(':id/archive')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'ARCHIVE_PRODUCT', entityType: 'Product', entityIdParam: 'id' })
  archive(@Param('id') id: string, @Body() body: ArchiveProductDto) {
    return this.catalogService.archiveProduct(id, body);
  }

  @Post(':id/price-policy')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'SET_PRODUCT_PRICE_POLICY', entityType: 'Product', entityIdParam: 'id' })
  setPricePolicy(@Param('id') id: string, @Body() body: SetPricePolicyDto) {
    return this.catalogService.setPricePolicy(id, body);
  }
}
