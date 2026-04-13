import { Transform } from 'class-transformer';
import { GenericStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CatalogListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  category?: string;

  @IsOptional()
  @IsString()
  variantOfProductId?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  })
  @IsBoolean()
  includeArchived?: boolean;
}

export class CreateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsString()
  @MaxLength(80)
  productType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  categoryPath?: string;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @IsPositive()
  unitPrice!: number;

  @IsOptional()
  @IsString()
  variantOfProductId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  pricePolicyCode?: string;

  @IsOptional()
  @IsObject()
  attributesJson?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  productType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  categoryPath?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsString()
  variantOfProductId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  pricePolicyCode?: string;

  @IsOptional()
  @IsObject()
  attributesJson?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;
}

export class ArchiveProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class SetPricePolicyDto {
  @IsString()
  @MaxLength(60)
  policyCode!: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}

export class ImportProductsDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @IsObject({ each: true })
  rows!: Record<string, unknown>[];
}
