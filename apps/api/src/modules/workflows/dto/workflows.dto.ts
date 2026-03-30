import { Transform } from 'class-transformer';
import { GenericStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class WorkflowsListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  module?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  definitionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  targetType?: string;
}

export class CreateWorkflowDefinitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsString()
  @MaxLength(80)
  module!: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  version?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;

  @IsObject()
  definitionJson!: Record<string, unknown>;
}

export class UpdateWorkflowDefinitionDto {
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
  @MaxLength(80)
  module?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  version?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;

  @IsOptional()
  @IsObject()
  definitionJson?: Record<string, unknown>;
}

export class CreateWorkflowInstanceDto {
  @IsString()
  @MaxLength(80)
  definitionId!: string;

  @IsString()
  @MaxLength(80)
  targetType!: string;

  @IsString()
  @MaxLength(80)
  targetId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  currentStep?: string;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  startedBy?: string;

  @IsOptional()
  @IsObject()
  contextJson?: Record<string, unknown>;
}

export class UpdateWorkflowInstanceDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  currentStep?: string;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;

  @IsOptional()
  @IsObject()
  contextJson?: Record<string, unknown>;
}

export class CreateApprovalDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  instanceId?: string;

  @IsString()
  @MaxLength(80)
  targetType!: string;

  @IsString()
  @MaxLength(80)
  targetId!: string;

  @IsString()
  @MaxLength(120)
  requesterId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  approverId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  stepKey?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsObject()
  contextJson?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;
}

export class UpdateApprovalDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  approverId?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsDateString()
  decidedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  decisionNote?: string;

  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;
}

export class SubmitWorkflowDto {
  @IsString()
  @MaxLength(80)
  definitionId!: string;

  @IsString()
  @MaxLength(80)
  targetType!: string;

  @IsString()
  @MaxLength(80)
  targetId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  requestedBy?: string;

  @IsOptional()
  @IsObject()
  contextJson?: Record<string, unknown>;
}

export class WorkflowDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  approvalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  actorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReassignWorkflowDto extends WorkflowDecisionDto {
  @IsString()
  @MaxLength(120)
  toApproverId!: string;
}

export class DelegateWorkflowDto extends WorkflowDecisionDto {
  @IsString()
  @MaxLength(120)
  toApproverId!: string;
}

export class EscalateWorkflowDto extends WorkflowDecisionDto {
  @IsString()
  @MaxLength(120)
  escalatedTo!: string;
}
