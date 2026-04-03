import { Transform } from 'class-transformer';
import { GenericStatus } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export const ASSISTANT_SCOPE_TYPES = ['company', 'branch', 'department', 'self'] as const;
export type AssistantScopeTypeValue = (typeof ASSISTANT_SCOPE_TYPES)[number];

export const ASSISTANT_SOURCE_TYPES = ['FOLDER', 'LINK'] as const;
export type AssistantSourceTypeValue = (typeof ASSISTANT_SOURCE_TYPES)[number];

export const ASSISTANT_RUN_TYPES = ['MANUAL', 'HOURLY', 'DAILY'] as const;
export type AssistantRunTypeValue = (typeof ASSISTANT_RUN_TYPES)[number];

export const ASSISTANT_CHANNEL_TYPES = ['WEBHOOK', 'ZALO', 'TELEGRAM'] as const;
export type AssistantChannelTypeValue = (typeof ASSISTANT_CHANNEL_TYPES)[number];

export class AssistantProxyQueryDto extends PaginationQueryDto {
}

export class AssistantKnowledgeSourcesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => String(value).toUpperCase())
  @IsIn(ASSISTANT_SOURCE_TYPES)
  sourceType?: AssistantSourceTypeValue;

  @IsOptional()
  @Transform(({ value }) => String(value).toLowerCase())
  @IsIn(['true', 'false'])
  isActive?: string;
}

export class CreateAssistantKnowledgeSourceDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @Transform(({ value }) => String(value).toUpperCase())
  @IsIn(ASSISTANT_SOURCE_TYPES)
  sourceType!: AssistantSourceTypeValue;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  rootPath?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  sourceUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includePatterns?: string[];

  @IsOptional()
  @Transform(({ value }) => String(value).toLowerCase())
  @IsIn(ASSISTANT_SCOPE_TYPES)
  scopeType?: AssistantScopeTypeValue;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopeRefIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedRoles?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  classification?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  scheduleRule?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || String(value).toLowerCase() === 'true')
  @IsBoolean()
  isActive?: boolean;
}

export class SyncAssistantKnowledgeSourceDto {
  @IsOptional()
  @Transform(({ value }) => value === true || String(value).toLowerCase() === 'true')
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @Min(1)
  @Max(1000)
  maxFiles?: number;
}

export class AssistantKnowledgeDocumentsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceId?: string;

  @IsOptional()
  @Transform(({ value }) => String(value).toLowerCase())
  @IsIn(ASSISTANT_SCOPE_TYPES)
  scopeType?: AssistantScopeTypeValue;
}

export class CreateAssistantRunDto {
  @IsOptional()
  @Transform(({ value }) => String(value).toUpperCase())
  @IsIn(ASSISTANT_RUN_TYPES)
  runType?: AssistantRunTypeValue;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reportPacks?: string[];

  @IsOptional()
  @Transform(({ value }) => value === true || String(value).toLowerCase() === 'true')
  @IsBoolean()
  dispatchChat?: boolean;
}

export class AssistantRunsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(GenericStatus)
  status?: GenericStatus;

  @IsOptional()
  @Transform(({ value }) => String(value).toUpperCase())
  @IsIn(ASSISTANT_RUN_TYPES)
  runType?: AssistantRunTypeValue;
}

export class AssistantRunDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class CreateAssistantDispatchChannelDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @Transform(({ value }) => String(value).toUpperCase())
  @IsIn(ASSISTANT_CHANNEL_TYPES)
  channelType!: AssistantChannelTypeValue;

  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  endpointUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  webhookSecretRef?: string;

  @IsOptional()
  @Transform(({ value }) => String(value).toLowerCase())
  @IsIn(ASSISTANT_SCOPE_TYPES)
  scopeType?: AssistantScopeTypeValue;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopeRefIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedReportPacks?: string[];

  @IsOptional()
  @Transform(({ value }) => value === true || String(value).toLowerCase() === 'true')
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAssistantDispatchChannelDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(({ value }) => String(value).toUpperCase())
  @IsIn(ASSISTANT_CHANNEL_TYPES)
  channelType?: AssistantChannelTypeValue;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  endpointUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  webhookSecretRef?: string;

  @IsOptional()
  @Transform(({ value }) => String(value).toLowerCase())
  @IsIn(ASSISTANT_SCOPE_TYPES)
  scopeType?: AssistantScopeTypeValue;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopeRefIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedReportPacks?: string[];

  @IsOptional()
  @Transform(({ value }) => value === true || String(value).toLowerCase() === 'true')
  @IsBoolean()
  isActive?: boolean;
}

export class AssistantDispatchChannelsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => String(value).toUpperCase())
  @IsIn(ASSISTANT_CHANNEL_TYPES)
  channelType?: AssistantChannelTypeValue;

  @IsOptional()
  @Transform(({ value }) => String(value).toLowerCase())
  @IsIn(ASSISTANT_SCOPE_TYPES)
  scopeType?: AssistantScopeTypeValue;

  @IsOptional()
  @Transform(({ value }) => String(value).toLowerCase())
  @IsIn(['true', 'false'])
  isActive?: string;
}
