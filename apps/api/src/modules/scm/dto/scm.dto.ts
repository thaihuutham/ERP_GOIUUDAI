import { Transform } from 'class-transformer';
import { GenericStatus } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ScmListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  lifecycleStatus?: string;

  @IsOptional()
  @IsString()
  vendorId?: string;
}

export class CreateVendorDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  code?: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(25)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;
}

export class UpdateVendorDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(25)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;
}

export class CreatePurchaseOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  poNo?: string;

  @IsOptional()
  @IsString()
  vendorId?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  totalAmount?: number;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  lifecycleStatus?: string;

  @IsOptional()
  @IsDateString()
  expectedReceiveAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  relatedSalesOrderNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdatePurchaseOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  poNo?: string;

  @IsOptional()
  @IsString()
  vendorId?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  totalAmount?: number;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;

  @IsOptional()
  @IsDateString()
  expectedReceiveAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  relatedSalesOrderNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreateShipmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  shipmentNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  orderRef?: string;

  @IsOptional()
  @IsString()
  purchaseOrderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  carrier?: string;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;

  @IsOptional()
  @IsDateString()
  shippedAt?: string;

  @IsOptional()
  @IsDateString()
  deliveredAt?: string;

  @IsOptional()
  @IsDateString()
  expectedDeliveryAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  lifecycleStatus?: string;

  @IsOptional()
  @IsBoolean()
  damageReported?: boolean;
}

export class UpdateShipmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  shipmentNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  orderRef?: string;

  @IsOptional()
  @IsString()
  purchaseOrderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  carrier?: string;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;

  @IsOptional()
  @IsDateString()
  shippedAt?: string;

  @IsOptional()
  @IsDateString()
  deliveredAt?: string;

  @IsOptional()
  @IsDateString()
  expectedDeliveryAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  lifecycleStatus?: string;

  @IsOptional()
  @IsBoolean()
  damageReported?: boolean;
}

export class CreateDistributionDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  distributionNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  destination?: string;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;
}

export class UpdateDistributionDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  distributionNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  destination?: string;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;
}

export class CreateDemandForecastDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sku?: string;

  @IsString()
  @MaxLength(30)
  period!: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  predictedQty?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;
}

export class UpdateDemandForecastDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  period?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  predictedQty?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;
}

export class CreateSupplyChainRiskDto {
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsString()
  @MaxLength(50)
  severity!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  mitigation?: string;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;
}

export class UpdateSupplyChainRiskDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  severity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  mitigation?: string;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;
}

export class PoTransitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreatePurchaseReceiptDto {
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @IsPositive()
  receivedAmount!: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  receivedQty?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  acceptedQty?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  rejectedQty?: number;

  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  receiptNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  invoiceNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class VendorScorecardQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}
