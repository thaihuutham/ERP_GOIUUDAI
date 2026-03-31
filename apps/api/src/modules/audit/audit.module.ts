import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditArchiveService } from './audit-archive.service';
import { AuditArchiveStorageService } from './audit-archive-storage.service';

@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditArchiveService, AuditArchiveStorageService],
  exports: [AuditService, AuditArchiveService]
})
export class AuditModule {}
