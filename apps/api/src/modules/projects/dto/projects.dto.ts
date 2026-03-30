import { Transform } from 'class-transformer';
import { GenericStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ProjectsListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;
}

export class CreateProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsDateString()
  baselineStartAt?: string;

  @IsOptional()
  @IsDateString()
  baselineEndAt?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  plannedBudget?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  actualBudget?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  forecastPercent?: number;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsDateString()
  baselineStartAt?: string;

  @IsOptional()
  @IsDateString()
  baselineEndAt?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  plannedBudget?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  actualBudget?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  forecastPercent?: number;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;
}

export class CreateProjectTaskDto {
  @IsString()
  projectId!: string;

  @IsString()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  assignedTo?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  weight?: number;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;
}

export class UpdateTaskStatusDto {
  @IsEnum(GenericStatus)
  status!: GenericStatus;
}

export class CreateProjectResourceDto {
  @IsString()
  projectId!: string;

  @IsString()
  @MaxLength(80)
  resourceType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  resourceRef?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  quantity?: number;
}

export class CreateProjectBudgetDto {
  @IsString()
  projectId!: string;

  @IsString()
  @MaxLength(80)
  budgetType!: string;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  amount!: number;
}

export class CreateProjectTimeEntryDto {
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsString()
  employeeId!: string;

  @IsOptional()
  @IsDateString()
  workDate?: string;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  hours!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class ProjectForecastDto {
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  forecastPercent!: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  actualBudget?: number;
}
