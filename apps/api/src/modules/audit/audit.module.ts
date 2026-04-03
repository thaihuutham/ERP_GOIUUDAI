import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditArchiveService } from './audit-archive.service';
import { AuditArchiveStorageService } from './audit-archive-storage.service';
import { AuditAccessScopeService } from './audit-access-scope.service';

@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditArchiveService, AuditArchiveStorageService, AuditAccessScopeService],
  exports: [AuditService, AuditArchiveService]
})
export class AuditModule {}
