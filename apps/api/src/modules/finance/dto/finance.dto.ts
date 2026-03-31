import { Transform } from 'class-transformer';
import { GenericStatus } from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEnum,
  Matches,
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { Type } from 'class-transformer';

export class FinanceListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  invoiceType?: string;

  @IsOptional()
  @IsDateString()
  asOf?: string;
}

export class JournalEntryLineDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  accountCode?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  debit?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  credit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CreateInvoiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  invoiceNo?: string;

  @IsString()
  @MaxLength(40)
  invoiceType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  partnerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  orderId?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  totalAmount?: number;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;
}

export class UpdateInvoiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  invoiceNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  invoiceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  partnerName?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  totalAmount?: number;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;
}

export class CreateAccountDto {
  @IsString()
  @MaxLength(60)
  accountCode!: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsString()
  @MaxLength(60)
  accountType!: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  balance?: number;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  accountCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  accountType?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  balance?: number;
}

export class CreateJournalEntryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  entryNo?: string;

  @IsDateString()
  entryDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JournalEntryLineDto)
  lines?: JournalEntryLineDto[];
}

export class UpdateJournalEntryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  entryNo?: string;

  @IsOptional()
  @IsDateString()
  entryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JournalEntryLineDto)
  lines?: JournalEntryLineDto[];
}

export class CreateBudgetPlanDto {
  @IsString()
  @MaxLength(100)
  category!: string;

  @IsString()
  @MaxLength(30)
  fiscalPeriod!: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  plannedAmount?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  actualAmount?: number;
}

export class UpdateBudgetPlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  fiscalPeriod?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  plannedAmount?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  actualAmount?: number;
}

export class InvoiceTransitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreateInvoiceFromOrderDto {
  @IsString()
  @MaxLength(120)
  orderId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  invoiceType?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class FinancePeriodParamDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period!: string;
}

export class CreatePaymentAllocationDto {
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @IsPositive()
  allocatedAmount!: number;

  @IsOptional()
  @IsDateString()
  allocatedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  paymentRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  invoiceNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  createdBy?: string;
}
