import { Transform, Type } from 'class-transformer';
import { CheckoutOrderGroup } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator';

export class SalesCheckoutOrderItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  productId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  productName?: string;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  quantity!: number;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  serviceContractId?: string;

  @IsOptional()
  @IsObject()
  serviceMetaJson?: Record<string, unknown>;
}

export class CreateSalesCheckoutOrderDto {
  @IsEnum(CheckoutOrderGroup)
  orderGroup!: CheckoutOrderGroup;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  templateCode?: string;

  @IsOptional()
  @IsObject()
  templateFields?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  employeeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  createdBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SalesCheckoutOrderItemDto)
  items!: SalesCheckoutOrderItemDto[];
}

export class PaymentBankEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  intentCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  transactionRef!: string;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsISO8601()
  bankTxnAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class PaymentOverrideDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  reference!: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ActivationLineCompleteDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  serviceContractId?: string;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  activationRef?: string;

  @IsOptional()
  @IsObject()
  serviceMetaJson?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReEvaluateInvoiceActionDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === false) return value;
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return false;
  })
  @IsBoolean()
  force?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
