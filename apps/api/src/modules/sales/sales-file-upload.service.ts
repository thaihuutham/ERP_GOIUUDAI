import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { extname, join, resolve } from 'path';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg'
]);

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg']);

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

type UploadedFileInfo = {
  fileId: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
};

@Injectable()
export class SalesFileUploadService {
  private readonly logger = new Logger(SalesFileUploadService.name);
  private readonly baseDir: string;

  constructor(@Optional() @Inject(ConfigService) private readonly config?: ConfigService) {
    const configuredDir = this.readString(this.config?.get<string>('CHECKOUT_UPLOAD_DIR'));
    this.baseDir = configuredDir || resolve(process.cwd(), 'data', 'uploads', 'checkout');
    this.ensureDir(this.baseDir);
    this.logger.log(`Checkout file upload directory: ${this.baseDir}`);
  }

  uploadFile(
    file: Express.Multer.File,
    tenantId: string,
    orderId?: string
  ): UploadedFileInfo {
    this.validateFile(file);

    const ext = extname(file.originalname).toLowerCase();
    const fileId = randomUUID();
    const fileName = `${fileId}${ext}`;

    const subdir = orderId
      ? join(this.baseDir, this.sanitizePath(tenantId), this.sanitizePath(orderId))
      : join(this.baseDir, this.sanitizePath(tenantId), '_unlinked');

    this.ensureDir(subdir);

    const filePath = join(subdir, fileName);
    writeFileSync(filePath, file.buffer);

    const relativePath = orderId
      ? `checkout/${this.sanitizePath(tenantId)}/${this.sanitizePath(orderId)}/${fileName}`
      : `checkout/${this.sanitizePath(tenantId)}/_unlinked/${fileName}`;

    this.logger.log(`Uploaded file: ${filePath} (${file.size} bytes)`);

    return {
      fileId,
      fileName,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      url: `/api/v1/sales/checkout/files/${fileId}?tenant=${encodeURIComponent(tenantId)}${orderId ? `&order=${encodeURIComponent(orderId)}` : ''}`
    };
  }

  resolveFilePath(fileId: string, tenantId: string, orderId?: string): string {
    const sanitizedFileId = this.sanitizePath(fileId);

    // Try orderId-scoped path first
    if (orderId) {
      const scoped = join(this.baseDir, this.sanitizePath(tenantId), this.sanitizePath(orderId));
      const match = this.findFileByPrefix(scoped, sanitizedFileId);
      if (match) return match;
    }

    // Try unlinked path
    const unlinked = join(this.baseDir, this.sanitizePath(tenantId), '_unlinked');
    const match = this.findFileByPrefix(unlinked, sanitizedFileId);
    if (match) return match;

    // Fallback: scan all subdirs of tenant
    const tenantDir = join(this.baseDir, this.sanitizePath(tenantId));
    if (existsSync(tenantDir)) {
      const subdirs = readdirSync(tenantDir, { withFileTypes: true }).filter((d) => d.isDirectory());
      for (const sub of subdirs) {
        const found = this.findFileByPrefix(join(tenantDir, sub.name), sanitizedFileId);
        if (found) return found;
      }
    }

    throw new NotFoundException(`File không tìm thấy: ${fileId}`);
  }

  /**
   * Cleanup orphan uploads older than retentionDays.
   * Scans all tenant directories for files in _unlinked/ or order dirs
   * where the file modification time exceeds retentionDays.
   */
  cleanupOrphanFiles(retentionDays = 30): { scanned: number; deleted: number; errors: string[] } {
    const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let scanned = 0;
    let deleted = 0;
    const errors: string[] = [];

    if (!existsSync(this.baseDir)) {
      return { scanned, deleted, errors };
    }

    const tenantDirs = readdirSync(this.baseDir, { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const tenantDir of tenantDirs) {
      const tenantPath = join(this.baseDir, tenantDir.name);
      const subdirs = readdirSync(tenantPath, { withFileTypes: true }).filter((d) => d.isDirectory());

      for (const sub of subdirs) {
        const subPath = join(tenantPath, sub.name);
        let files: string[];
        try {
          files = readdirSync(subPath).filter((f) => !f.startsWith('.'));
        } catch {
          continue;
        }

        for (const file of files) {
          scanned += 1;
          const filePath = join(subPath, file);
          try {
            const stat = statSync(filePath);
            if (stat.mtimeMs < cutoffMs) {
              rmSync(filePath, { force: true });
              deleted += 1;
              this.logger.log(`Cleaned up orphan file: ${filePath}`);
            }
          } catch (error) {
            errors.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        // Remove empty subdirectory
        try {
          const remaining = readdirSync(subPath);
          if (remaining.length === 0) {
            rmSync(subPath, { recursive: true, force: true });
          }
        } catch {
          // ignore
        }
      }
    }

    return { scanned, deleted, errors };
  }

  private validateFile(file: Express.Multer.File) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Không tìm thấy file upload.');
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(`File quá lớn. Giới hạn: ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB.`);
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`Loại file không hợp lệ: ${file.mimetype}. Chỉ cho phép: PDF, PNG, JPG/JPEG.`);
    }
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(`Phần mở rộng file không hợp lệ: ${ext}. Chỉ cho phép: .pdf, .png, .jpg, .jpeg.`);
    }
  }

  private findFileByPrefix(dir: string, prefix: string): string | null {
    if (!existsSync(dir)) return null;
    try {
      const files = readdirSync(dir);
      const match = files.find((f) => f.startsWith(prefix));
      return match ? join(dir, match) : null;
    } catch {
      return null;
    }
  }

  private ensureDir(dir: string) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private sanitizePath(segment: string) {
    return segment.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  }

  private readString(value: unknown, fallback = '') {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
  }
}
