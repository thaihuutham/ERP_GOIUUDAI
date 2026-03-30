import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/auth.decorators';
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
  create(@Body() body: CreateProductDto) {
    return this.catalogService.createProduct(body);
  }

  @Patch(':id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  update(@Param('id') id: string, @Body() body: UpdateProductDto) {
    return this.catalogService.updateProduct(id, body);
  }

  @Post(':id/archive')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  archive(@Param('id') id: string, @Body() body: ArchiveProductDto) {
    return this.catalogService.archiveProduct(id, body);
  }

  @Post(':id/price-policy')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  setPricePolicy(@Param('id') id: string, @Body() body: SetPricePolicyDto) {
    return this.catalogService.setPricePolicy(id, body);
  }
}
