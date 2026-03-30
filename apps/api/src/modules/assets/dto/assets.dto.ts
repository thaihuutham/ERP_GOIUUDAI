import { Transform } from 'class-transformer';
import { GenericStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class AssetsListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  lifecycleStatus?: string;
}

export class CreateAssetDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  assetCode?: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @IsOptional()
  @IsDateString()
  purchaseAt?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  value?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  lifecycleStatus?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  usefulLifeMonths?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  depreciationMethod?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  salvageValue?: number;

  @IsOptional()
  @IsDateString()
  depreciationStartAt?: string;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;
}

export class UpdateAssetDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  assetCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @IsOptional()
  @IsDateString()
  purchaseAt?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  value?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  lifecycleStatus?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  usefulLifeMonths?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  depreciationMethod?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  salvageValue?: number;

  @IsOptional()
  @IsDateString()
  depreciationStartAt?: string;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;
}

export class AllocateAssetDto {
  @IsString()
  employeeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class ReturnAssetDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class AssetLifecycleTransitionDto {
  @IsString()
  @MaxLength(40)
  action!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class CreateMaintenanceScheduleDto {
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsDateString()
  nextDueAt!: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(3650)
  frequencyDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class DepreciationPreviewQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(120)
  months?: number;
}

export class PostDepreciationDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  period?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @IsPositive()
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
