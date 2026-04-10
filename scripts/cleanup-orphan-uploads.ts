#!/usr/bin/env node
/**
 * Cron job script: Cleanup orphan checkout file uploads.
 *
 * Scans the checkout upload directory and removes files older than RETENTION_DAYS.
 * Designed to be run via cron, e.g.:
 *   0 3 * * * node /path/to/scripts/cleanup-orphan-uploads.js
 *
 * Environment variables:
 *   CHECKOUT_UPLOAD_DIR  — Upload base dir (default: data/uploads/checkout)
 *   RETENTION_DAYS       — Days to keep files (default: 30)
 */

import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs';
import { join, resolve } from 'path';

const RETENTION_DAYS = Number(process.env.RETENTION_DAYS ?? 30);
const CHECKOUT_UPLOAD_DIR = process.env.CHECKOUT_UPLOAD_DIR || resolve(process.cwd(), 'data', 'uploads', 'checkout');

function log(message: string) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

function cleanupOrphanFiles(baseDir: string, retentionDays: number) {
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let scanned = 0;
  let deleted = 0;
  const errors: string[] = [];

  if (!existsSync(baseDir)) {
    log(`Upload directory does not exist: ${baseDir}. Nothing to clean.`);
    return { scanned, deleted, errors };
  }

  const tenantDirs = readdirSync(baseDir, { withFileTypes: true }).filter((d) => d.isDirectory());

  for (const tenantDir of tenantDirs) {
    const tenantPath = join(baseDir, tenantDir.name);
    let subdirs: ReturnType<typeof readdirSync>;

    try {
      subdirs = readdirSync(tenantPath, { withFileTypes: true }).filter((d) => typeof d === 'object' && 'isDirectory' in d && d.isDirectory());
    } catch {
      continue;
    }

    for (const sub of subdirs) {
      const subName = typeof sub === 'string' ? sub : sub.name;
      const subPath = join(tenantPath, subName);
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
            log(`Deleted: ${filePath} (age: ${Math.round((Date.now() - stat.mtimeMs) / 86_400_000)}d)`);
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          errors.push(`${filePath}: ${msg}`);
        }
      }

      // Remove empty subdirectory
      try {
        const remaining = readdirSync(subPath);
        if (remaining.length === 0) {
          rmSync(subPath, { recursive: true, force: true });
          log(`Removed empty dir: ${subPath}`);
        }
      } catch {
        // ignore
      }
    }

    // Remove empty tenant directory
    try {
      const remaining = readdirSync(tenantPath);
      if (remaining.length === 0) {
        rmSync(tenantPath, { recursive: true, force: true });
        log(`Removed empty tenant dir: ${tenantPath}`);
      }
    } catch {
      // ignore
    }
  }

  return { scanned, deleted, errors };
}

// Main
log(`=== Checkout Upload Cleanup ===`);
log(`Base dir: ${CHECKOUT_UPLOAD_DIR}`);
log(`Retention: ${RETENTION_DAYS} days`);

const result = cleanupOrphanFiles(CHECKOUT_UPLOAD_DIR, RETENTION_DAYS);

log(`Scanned: ${result.scanned} files`);
log(`Deleted: ${result.deleted} files`);
if (result.errors.length > 0) {
  log(`Errors: ${result.errors.length}`);
  for (const err of result.errors) {
    log(`  ERROR: ${err}`);
  }
}
log(`=== Done ===`);

process.exit(result.errors.length > 0 ? 1 : 0);
