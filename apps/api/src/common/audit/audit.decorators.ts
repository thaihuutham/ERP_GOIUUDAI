import { SetMetadata } from '@nestjs/common';
import { AUDIT_ACTION_METADATA_KEY, AUDIT_READ_METADATA_KEY } from './audit.constants';
import { AuditActionMetadata, AuditReadMetadata } from './audit.types';

export const AuditAction = (metadata: AuditActionMetadata) => SetMetadata(AUDIT_ACTION_METADATA_KEY, metadata);

export const AuditRead = (metadata: AuditReadMetadata) => SetMetadata(AUDIT_READ_METADATA_KEY, metadata);
