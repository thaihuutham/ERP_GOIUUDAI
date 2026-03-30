import { Transform } from 'class-transformer';
import { GenericStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export const REPORT_OUTPUT_FORMATS = ['JSON', 'CSV', 'XLSX', 'PDF'] as const;
export type ReportOutputFormat = (typeof REPORT_OUTPUT_FORMATS)[number];

export class ReportsListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  moduleName?: string;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;
}

export class ModuleDataQueryDto extends PaginationQueryDto {
  @IsString()
  @MaxLength(80)
  name!: string;
}

export class CreateReportDefinitionDto {
  @IsString()
  @MaxLength(80)
  reportType!: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  moduleName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  templateCode?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsIn(REPORT_OUTPUT_FORMATS)
  outputFormat?: ReportOutputFormat;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  scheduleRule?: string;

  @IsOptional()
  @IsDateString()
  nextRunAt?: string;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;

  @IsOptional()
  @IsObject()
  configJson?: Record<string, unknown>;
}

export class UpdateReportDefinitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  reportType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  moduleName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  templateCode?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsIn(REPORT_OUTPUT_FORMATS)
  outputFormat?: ReportOutputFormat;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  scheduleRule?: string;

  @IsOptional()
  @IsDateString()
  nextRunAt?: string;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;

  @IsOptional()
  @IsObject()
  configJson?: Record<string, unknown>;
}

export class GenerateReportRunDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsIn(REPORT_OUTPUT_FORMATS)
  outputFormat?: ReportOutputFormat;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;
}

export class RunDueSchedulesDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
