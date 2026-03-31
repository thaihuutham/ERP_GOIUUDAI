import { gunzipSync, gzipSync } from 'zlib';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { AuditArchiveStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditArchiveStorageService } from './audit-archive-storage.service';

type ArchivePolicy = {
  auditHotRetentionMonths: number;
  auditRetentionYears: number;
};

type ArchiveRunArgs = {
  dryRun: boolean;
  now: Date;
  policy: ArchivePolicy;
  tenantId: string;
  maxWindowsPerRun?: number;
};

type ArchiveDayWindow = {
  start: Date;
  end: Date;
  rowCount: number;
};

type ArchiveRunSummary = {
  candidateWindows: number;
  archivedWindows: number;
  archivedRows: number;
  prunedRows: number;
  skippedWindows: number;
  failedWindows: number;
  storageEnabled: boolean;
};

type AuditColdQueryResult<T> = {
  items: T[];
  hasMore: boolean;
  scannedFiles: number;
  scannedRows: number;
  durationMs: number;
};

type QueryArchivedLogsArgs<T> = {
  tenantId: string;
  from: Date;
  to: Date;
  limit: number;
  offset: number;
  matcher: (row: T) => boolean;
};

@Injectable()
export class AuditArchiveService {
  private readonly logger = new Logger(AuditArchiveService.name);
  private readonly exportChunkSize = 2000;
  private readonly defaultMaxWindowsPerRun = 7;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditArchiveStorageService) private readonly storage: AuditArchiveStorageService
  ) {}

  toHotThreshold(now: Date, auditHotRetentionMonths: number) {
    const threshold = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    threshold.setUTCMonth(threshold.getUTCMonth() - Math.max(1, auditHotRetentionMonths));
    return threshold;
  }

  toRetentionThreshold(now: Date, auditRetentionYears: number) {
    return new Date(now.getTime() - Math.max(1, auditRetentionYears) * 365 * 24 * 60 * 60 * 1000);
  }

  async runArchiveAndPrune(args: ArchiveRunArgs): Promise<ArchiveRunSummary> {
    const maxWindows = this.toInt(args.maxWindowsPerRun, this.defaultMaxWindowsPerRun, 1, 90);
    const hotThreshold = this.toHotThreshold(args.now, args.policy.auditHotRetentionMonths);
    const retentionThreshold = this.toRetentionThreshold(args.now, args.policy.auditRetentionYears);
    const storageEnabled = this.storage.isEnabled();

    const windows = await this.listCandidateWindows({
      tenantId: args.tenantId,
      hotThreshold,
      retentionThreshold,
      maxWindows
    });

    const summary: ArchiveRunSummary = {
      candidateWindows: windows.length,
      archivedWindows: 0,
      archivedRows: 0,
      prunedRows: 0,
      skippedWindows: 0,
      failedWindows: 0,
      storageEnabled
    };

    for (const window of windows) {
      try {
        if (!storageEnabled) {
          summary.skippedWindows += 1;
          continue;
        }

        const manifest = await this.ensureManifest(args.tenantId, window.start, window.end, args.dryRun);
        if (!manifest) {
          summary.skippedWindows += 1;
          continue;
        }

        if (manifest.status === AuditArchiveStatus.COMPLETED && manifest.prunedAt) {
          summary.skippedWindows += 1;
          continue;
        }

        const rows = args.dryRun ? [] : await this.readWindowRows(args.tenantId, window.start, window.end);
        const rowCount = args.dryRun ? window.rowCount : rows.length;

        if (rowCount === 0) {
          if (!args.dryRun) {
            await this.prisma.client.auditArchiveManifest.updateMany({
              where: { id: manifest.id },
              data: {
                status: AuditArchiveStatus.NOOP,
                rowCount: 0,
                archivedAt: args.now,
                prunedAt: args.now,
                errorMessage: null
              }
            });
          }
          summary.skippedWindows += 1;
          continue;
        }

        if (!args.dryRun) {
          const serialized = this.serializeRows(rows);
          const gzBody = gzipSync(serialized);
          const rawChecksumHex = this.storage.toHexSha256(serialized);
          const gzChecksumHex = this.storage.toHexSha256(gzBody);
          const rawChecksumBase64 = this.storage.toBase64Sha256(serialized);
          const key = this.buildObjectKey(args.tenantId, window.start, window.end);

          const uploadResult = await this.storage.uploadObject({
            key,
            body: gzBody,
            checksumSha256: this.storage.toBase64Sha256(gzBody),
            contentType: 'application/x-ndjson+gzip',
            metadata: {
              tenantid: args.tenantId,
              windowstart: window.start.toISOString(),
              windowend: window.end.toISOString(),
              rowcount: String(rowCount),
              rawsha256: rawChecksumHex
            }
          });
          await this.storage.verifyObjectExists(key);

          await this.prisma.client.auditArchiveManifest.updateMany({
            where: { id: manifest.id },
            data: {
              objectKey: key,
              objectVersion: uploadResult.objectVersion,
              rowCount,
              checksumSha256: rawChecksumHex,
              gzChecksumSha256: gzChecksumHex,
              firstHash: rows[0]?.hash ? String(rows[0]?.hash) : null,
              lastHash: rows[rowCount - 1]?.hash ? String(rows[rowCount - 1]?.hash) : null,
              status: AuditArchiveStatus.COMPLETED,
              archivedAt: args.now,
              errorMessage: null
            }
          });

          const deletedRows = await this.pruneWindow(args.tenantId, window.start, window.end, retentionThreshold);
          await this.prisma.client.auditArchiveManifest.updateMany({
            where: { id: manifest.id },
            data: {
              prunedAt: args.now
            }
          });

          summary.prunedRows += deletedRows;
          // Keep linter happy that raw checksum base64 is intentionally computed for upload integrity.
          if (!rawChecksumBase64) {
            throw new Error('Invalid raw checksum');
          }
        }

        summary.archivedWindows += 1;
        summary.archivedRows += rowCount;
      } catch (error) {
        summary.failedWindows += 1;
        this.logger.error(
          `Archive window failed tenant=${args.tenantId} start=${window.start.toISOString()} end=${window.end.toISOString()}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );

        if (!args.dryRun) {
          await this.prisma.client.auditArchiveManifest.updateMany({
            where: {
              tenant_Id: args.tenantId,
              windowStart: window.start,
              windowEnd: window.end
            },
            data: {
              status: AuditArchiveStatus.FAILED,
              errorMessage: String(error instanceof Error ? error.message : error)
            }
          });
        }
      }
    }

    return summary;
  }

  async queryArchivedLogs<T extends { createdAt: string; id: string }>(
    args: QueryArchivedLogsArgs<T>
  ): Promise<AuditColdQueryResult<T>> {
    const startedAt = Date.now();
    const manifests = await this.prisma.client.auditArchiveManifest.findMany({
      where: {
        tenant_Id: args.tenantId,
        status: AuditArchiveStatus.COMPLETED,
        archivedAt: { not: null },
        objectKey: { not: null },
        windowEnd: { gt: args.from },
        windowStart: { lt: args.to }
      },
      orderBy: [{ windowStart: 'desc' }]
    });

    const target = args.limit + 1;
    const rows: T[] = [];
    let matched = 0;
    let scannedFiles = 0;
    let scannedRows = 0;

    for (const manifest of manifests) {
      if (rows.length >= target) {
        break;
      }

      if (!manifest.objectKey) {
        continue;
      }

      scannedFiles += 1;
      const gzBody = await this.storage.readObjectBuffer(manifest.objectKey);
      const ndjson = gunzipSync(gzBody).toString('utf8');
      const lines = ndjson.split('\n').filter(Boolean);
      scannedRows += lines.length;

      for (let index = lines.length - 1; index >= 0; index -= 1) {
        if (rows.length >= target) {
          break;
        }

        const line = lines[index];
        let parsed: T;
        try {
          parsed = JSON.parse(line) as T;
        } catch {
          continue;
        }

        if (!args.matcher(parsed)) {
          continue;
        }

        if (matched < args.offset) {
          matched += 1;
          continue;
        }

        rows.push(parsed);
      }
    }

    const hasMore = rows.length > args.limit;
    const items = hasMore ? rows.slice(0, args.limit) : rows;

    return {
      items,
      hasMore,
      scannedFiles,
      scannedRows,
      durationMs: Date.now() - startedAt
    };
  }

  requireStorageEnabledForArchiveQuery() {
    if (!this.storage.isEnabled()) {
      throw new BadRequestException('Archive storage chưa được cấu hình.');
    }
  }

  private async ensureManifest(tenantId: string, windowStart: Date, windowEnd: Date, dryRun: boolean) {
    const existing = await this.prisma.client.auditArchiveManifest.findUnique({
      where: {
        tenant_Id_windowStart_windowEnd: {
          tenant_Id: tenantId,
          windowStart,
          windowEnd
        }
      }
    });

    if (existing) {
      if (dryRun) {
        return existing;
      }
      await this.prisma.client.auditArchiveManifest.updateMany({
        where: { id: existing.id },
        data: {
          status: AuditArchiveStatus.PENDING,
          errorMessage: null
        }
      });
      return {
        ...existing,
        status: AuditArchiveStatus.PENDING
      };
    }

    if (dryRun) {
      return {
        id: 'dry-run',
        tenant_Id: tenantId,
        windowStart,
        windowEnd,
        objectKey: null,
        objectVersion: null,
        rowCount: 0,
        checksumSha256: null,
        gzChecksumSha256: null,
        firstHash: null,
        lastHash: null,
        status: AuditArchiveStatus.PENDING,
        errorMessage: null,
        archivedAt: null,
        prunedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }

    return this.prisma.client.auditArchiveManifest.create({
      data: {
        tenant_Id: tenantId,
        windowStart,
        windowEnd,
        status: AuditArchiveStatus.PENDING
      }
    });
  }

  private async listCandidateWindows(args: {
    tenantId: string;
    hotThreshold: Date;
    retentionThreshold: Date;
    maxWindows: number;
  }): Promise<ArchiveDayWindow[]> {
    const rows = await this.prisma.client.$queryRaw<
      Array<{ day_start: Date; row_count: bigint | number }>
    >(
      Prisma.sql`
        SELECT date_trunc('day', "createdAt") AS day_start, COUNT(*) AS row_count
        FROM "audit_logs"
        WHERE "tenant_Id" = ${args.tenantId}
          AND "createdAt" >= ${args.retentionThreshold}
          AND "createdAt" < ${args.hotThreshold}
        GROUP BY 1
        ORDER BY 1 ASC
        LIMIT ${args.maxWindows}
      `
    );

    return rows
      .map((row) => {
        const start = new Date(row.day_start);
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        return {
          start,
          end,
          rowCount: Number(row.row_count ?? 0)
        };
      })
      .filter((window) => window.rowCount > 0);
  }

  private async readWindowRows(tenantId: string, windowStart: Date, windowEnd: Date) {
    const rows: Array<Record<string, unknown>> = [];
    let cursor: string | undefined;

    while (true) {
      const batch = await this.prisma.client.auditLog.findMany({
        where: {
          tenant_Id: tenantId,
          createdAt: {
            gte: windowStart,
            lt: windowEnd
          }
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: this.exportChunkSize,
        ...(cursor
          ? {
              cursor: {
                id: cursor
              },
              skip: 1
            }
          : {})
      });

      if (batch.length === 0) {
        break;
      }

      rows.push(
        ...batch.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString()
        }))
      );
      cursor = batch[batch.length - 1]?.id;
      if (!cursor) {
        break;
      }
    }

    return rows;
  }

  private async pruneWindow(tenantId: string, windowStart: Date, windowEnd: Date, retentionThreshold: Date) {
    const result = await this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.audit_prune = 'on'`);
      const deleted = await tx.auditLog.deleteMany({
        where: {
          tenant_Id: tenantId,
          createdAt: {
            gte: windowStart > retentionThreshold ? windowStart : retentionThreshold,
            lt: windowEnd
          }
        }
      });
      return deleted.count;
    });

    return result;
  }

  private serializeRows(rows: Array<Record<string, unknown>>) {
    const lines = rows.map((item) => JSON.stringify(item));
    return Buffer.from(`${lines.join('\n')}\n`);
  }

  private buildObjectKey(tenantId: string, windowStart: Date, windowEnd: Date) {
    const year = String(windowStart.getUTCFullYear());
    const month = String(windowStart.getUTCMonth() + 1).padStart(2, '0');
    const day = String(windowStart.getUTCDate()).padStart(2, '0');
    return `audit/${tenantId}/${year}/${month}/${day}/${windowStart.toISOString()}_${windowEnd.toISOString()}.ndjson.gz`;
  }

  private toInt(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
  }
}
