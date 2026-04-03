import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AssistantKnowledgeDocumentsQueryDto,
  AssistantKnowledgeSourcesQueryDto,
  CreateAssistantKnowledgeSourceDto,
  SyncAssistantKnowledgeSourceDto
} from './dto/assistant.dto';
import { AssistantEffectiveAccess } from './assistant.types';
import { canAccessAclResource, normalizeScopeType, toStringArray, uniqueStringArray } from './assistant-scope.util';

type IngestedDocument = {
  uri: string;
  title: string;
  contentText: string;
  metadataJson: Record<string, unknown>;
};

@Injectable()
export class AssistantKnowledgeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listSources(query: AssistantKnowledgeSourcesQueryDto) {
    const take = this.take(query.limit);
    const where: Prisma.AssistantKnowledgeSourceWhereInput = {};

    if (query.sourceType) {
      where.sourceType = String(query.sourceType).toUpperCase();
    }
    if (query.isActive === 'true') {
      where.isActive = true;
    }
    if (query.isActive === 'false') {
      where.isActive = false;
    }
    if (query.q) {
      const keyword = query.q.trim();
      if (keyword) {
        where.OR = [
          { name: { contains: keyword, mode: 'insensitive' } },
          { rootPath: { contains: keyword, mode: 'insensitive' } },
          { sourceUrl: { contains: keyword, mode: 'insensitive' } }
        ];
      }
    }

    const rows = await this.prisma.client.assistantKnowledgeSource.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take
    });

    return {
      items: rows,
      count: rows.length
    };
  }

  async createSource(dto: CreateAssistantKnowledgeSourceDto, access: AssistantEffectiveAccess) {
    const sourceType = String(dto.sourceType ?? '').toUpperCase();
    const rootPath = this.cleanString(dto.rootPath);
    const sourceUrl = this.cleanString(dto.sourceUrl);

    if (sourceType === 'FOLDER' && !rootPath) {
      throw new BadRequestException('sourceType=FOLDER yêu cầu rootPath.');
    }
    if (sourceType === 'LINK' && !sourceUrl) {
      throw new BadRequestException('sourceType=LINK yêu cầu sourceUrl.');
    }

    const includePatterns = uniqueStringArray(dto.includePatterns);
    const scopeType = normalizeScopeType(dto.scopeType ?? access.scope.type, access.scope.type);
    const scopeRefIds = uniqueStringArray(dto.scopeRefIds ?? access.scope.scopeRefIds);
    const allowedRoles = uniqueStringArray(dto.allowedRoles);

    return this.prisma.client.assistantKnowledgeSource.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        name: this.cleanString(dto.name),
        sourceType,
        rootPath: rootPath || null,
        sourceUrl: sourceUrl || null,
        includePatterns: includePatterns as Prisma.InputJsonValue,
        metadataJson: {
          createdByRole: access.actor.role,
          createdByUserId: access.actor.userId
        } as Prisma.InputJsonValue,
        scopeType,
        scopeRefIds: scopeRefIds as Prisma.InputJsonValue,
        allowedRoles: allowedRoles as Prisma.InputJsonValue,
        classification: this.cleanString(dto.classification) || 'internal',
        scheduleRule: this.cleanString(dto.scheduleRule) || null,
        isActive: dto.isActive ?? true,
        createdBy: access.actor.userId
      }
    });
  }

  async syncSource(sourceIdRaw: string, dto: SyncAssistantKnowledgeSourceDto, access: AssistantEffectiveAccess) {
    const sourceId = this.cleanString(sourceIdRaw);
    const source = await this.prisma.client.assistantKnowledgeSource.findFirst({
      where: { id: sourceId }
    });

    if (!source) {
      throw new NotFoundException(`Knowledge source not found: ${sourceId}`);
    }

    if (!source.isActive) {
      throw new BadRequestException('Knowledge source đang ở trạng thái INACTIVE.');
    }

    const maxFiles = this.resolveMaxFiles(dto.maxFiles);
    const dryRun = dto.dryRun === true;

    let documents: IngestedDocument[] = [];
    if (source.sourceType === 'FOLDER') {
      documents = await this.ingestFolderSource(source.rootPath, source.includePatterns, maxFiles);
    }
    if (source.sourceType === 'LINK') {
      documents = await this.ingestLinkSource(source.sourceUrl, maxFiles);
    }

    const now = new Date();

    if (!dryRun) {
      await this.persistIngestedDocuments(source, documents);
      await this.prisma.client.assistantKnowledgeSource.updateMany({
        where: { id: source.id },
        data: {
          lastSyncedAt: now,
          lastSyncStatus: 'SUCCESS',
          metadataJson: {
            ...(this.ensureRecord(source.metadataJson)),
            lastSyncedBy: access.actor.userId,
            lastSyncedDocumentCount: documents.length
          } as Prisma.InputJsonValue
        }
      });
    }

    return {
      sourceId: source.id,
      sourceType: source.sourceType,
      dryRun,
      ingestedDocuments: documents.length,
      ingestedUris: documents.map((item) => item.uri),
      syncedAt: now.toISOString()
    };
  }

  async listDocuments(query: AssistantKnowledgeDocumentsQueryDto, access: AssistantEffectiveAccess) {
    const take = this.take(query.limit);
    const where: Prisma.AssistantKnowledgeDocumentWhereInput = {};

    if (query.sourceId) {
      where.sourceId = this.cleanString(query.sourceId);
    }
    if (query.scopeType) {
      where.scopeType = normalizeScopeType(query.scopeType);
    }
    if (query.q) {
      const keyword = query.q.trim();
      if (keyword) {
        where.OR = [
          { title: { contains: keyword, mode: 'insensitive' } },
          { uri: { contains: keyword, mode: 'insensitive' } },
          { contentText: { contains: keyword, mode: 'insensitive' } }
        ];
      }
    }

    const rows = await this.prisma.client.assistantKnowledgeDocument.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: take * 5
    });

    const visible = rows.filter((row) => this.canAccessKnowledge(row, access));

    return {
      items: visible.slice(0, take),
      count: Math.min(visible.length, take)
    };
  }

  async retrieveContext(access: AssistantEffectiveAccess, options: { query?: string; limit?: number } = {}) {
    const limit = Math.min(Math.max(options.limit ?? 12, 1), 50);
    const where: Prisma.AssistantKnowledgeChunkWhereInput = {};
    const keyword = this.cleanString(options.query);
    if (keyword) {
      where.content = {
        contains: keyword,
        mode: 'insensitive'
      };
    }

    const rows = await this.prisma.client.assistantKnowledgeChunk.findMany({
      where,
      include: {
        document: {
          select: {
            id: true,
            title: true,
            uri: true,
            scopeType: true,
            scopeRefIds: true,
            allowedRoles: true,
            classification: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' },
      take: limit * 8
    });

    const filtered = rows
      .filter((row) => this.canAccessKnowledge(row, access))
      .slice(0, limit)
      .map((row) => ({
        chunkId: row.id,
        documentId: row.documentId,
        documentTitle: row.document.title,
        documentUri: row.document.uri,
        classification: row.classification,
        content: row.content,
        scopeType: row.scopeType,
        scopeRefIds: toStringArray(row.scopeRefIds)
      }));

    return {
      items: filtered,
      count: filtered.length
    };
  }

  private async persistIngestedDocuments(source: {
    id: string;
    scopeType: string;
    scopeRefIds: Prisma.JsonValue | null;
    allowedRoles: Prisma.JsonValue | null;
    classification: string;
  }, documents: IngestedDocument[]) {
    const existing = await this.prisma.client.assistantKnowledgeDocument.findMany({
      where: { sourceId: source.id },
      select: { id: true, uri: true }
    });

    const incomingUris = new Set(documents.map((item) => item.uri));
    const staleDocumentIds = existing
      .filter((item) => !incomingUris.has(item.uri))
      .map((item) => item.id);

    if (staleDocumentIds.length > 0) {
      await this.prisma.client.assistantKnowledgeDocument.deleteMany({
        where: {
          id: {
            in: staleDocumentIds
          }
        }
      });
    }

    for (const doc of documents) {
      const checksum = createHash('sha256').update(doc.contentText).digest('hex');
      const upserted = await this.prisma.client.assistantKnowledgeDocument.upsert({
        where: {
          tenant_Id_sourceId_uri: {
            tenant_Id: this.prisma.getTenantId(),
            sourceId: source.id,
            uri: doc.uri
          }
        },
        create: {
          tenant_Id: this.prisma.getTenantId(),
          sourceId: source.id,
          title: doc.title,
          uri: doc.uri,
          checksum,
          contentText: doc.contentText,
          metadataJson: doc.metadataJson as Prisma.InputJsonValue,
          scopeType: normalizeScopeType(source.scopeType),
          scopeRefIds: toStringArray(source.scopeRefIds) as Prisma.InputJsonValue,
          allowedRoles: toStringArray(source.allowedRoles) as Prisma.InputJsonValue,
          classification: this.cleanString(source.classification) || 'internal',
          status: 'ACTIVE',
          lastIndexedAt: new Date()
        },
        update: {
          title: doc.title,
          checksum,
          contentText: doc.contentText,
          metadataJson: doc.metadataJson as Prisma.InputJsonValue,
          scopeType: normalizeScopeType(source.scopeType),
          scopeRefIds: toStringArray(source.scopeRefIds) as Prisma.InputJsonValue,
          allowedRoles: toStringArray(source.allowedRoles) as Prisma.InputJsonValue,
          classification: this.cleanString(source.classification) || 'internal',
          status: 'ACTIVE',
          lastIndexedAt: new Date()
        }
      });

      await this.prisma.client.assistantKnowledgeChunk.deleteMany({
        where: {
          documentId: upserted.id
        }
      });

      const chunks = this.chunkContent(doc.contentText);
      if (chunks.length === 0) {
        continue;
      }

      await this.prisma.client.assistantKnowledgeChunk.createMany({
        data: chunks.map((chunk, index) => ({
          tenant_Id: this.prisma.getTenantId(),
          documentId: upserted.id,
          chunkIndex: index,
          content: chunk,
          tokenCount: this.estimateTokenCount(chunk),
          scopeType: normalizeScopeType(source.scopeType),
          scopeRefIds: toStringArray(source.scopeRefIds) as Prisma.InputJsonValue,
          allowedRoles: toStringArray(source.allowedRoles) as Prisma.InputJsonValue,
          classification: this.cleanString(source.classification) || 'internal'
        }))
      });
    }
  }

  private async ingestFolderSource(rootPathRaw: string | null, includePatternsRaw: Prisma.JsonValue | null, maxFiles: number) {
    const rootPath = this.cleanString(rootPathRaw);
    if (!rootPath) {
      throw new BadRequestException('Knowledge source FOLDER thiếu rootPath.');
    }

    const rootStat = await fs.stat(rootPath).catch(() => null);
    if (!rootStat || !rootStat.isDirectory()) {
      throw new BadRequestException(`Không tìm thấy thư mục tri thức: ${rootPath}`);
    }

    const includePatterns = uniqueStringArray(includePatternsRaw);
    const files = await this.walkDirectory(rootPath, maxFiles, includePatterns);

    const documents: IngestedDocument[] = [];
    for (const filePath of files) {
      const text = await fs.readFile(filePath, 'utf8').catch(() => '');
      if (!text.trim()) {
        continue;
      }

      documents.push({
        uri: filePath,
        title: path.basename(filePath),
        contentText: text,
        metadataJson: {
          source: 'folder',
          path: filePath,
          extension: path.extname(filePath)
        }
      });
    }

    return documents;
  }

  private async ingestLinkSource(sourceUrlRaw: string | null, maxFiles: number) {
    const sourceUrl = this.cleanString(sourceUrlRaw);
    if (!sourceUrl) {
      throw new BadRequestException('Knowledge source LINK thiếu sourceUrl.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(sourceUrl, {
        method: 'GET',
        signal: controller.signal
      });
      const html = await response.text();
      const content = this.stripHtml(html);

      return [
        {
          uri: sourceUrl,
          title: this.extractUrlTitle(sourceUrl),
          contentText: content,
          metadataJson: {
            source: 'link',
            status: response.status,
            contentType: response.headers.get('content-type') ?? null,
            truncated: maxFiles < 1
          }
        }
      ];
    } catch {
      return [
        {
          uri: sourceUrl,
          title: this.extractUrlTitle(sourceUrl),
          contentText: '',
          metadataJson: {
            source: 'link',
            status: 'fetch_failed'
          }
        }
      ];
    } finally {
      clearTimeout(timeout);
    }
  }

  private async walkDirectory(rootPath: string, maxFiles: number, includePatterns: string[]) {
    const results: string[] = [];
    const queue: string[] = [rootPath];

    while (queue.length > 0 && results.length < maxFiles) {
      const current = queue.shift() as string;
      const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);

      for (const entry of entries) {
        if (results.length >= maxFiles) {
          break;
        }

        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          queue.push(fullPath);
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        if (!this.isTextLikeFile(fullPath)) {
          continue;
        }

        if (!this.matchesPatterns(fullPath, includePatterns)) {
          continue;
        }

        results.push(fullPath);
      }
    }

    return results;
  }

  private matchesPatterns(filePath: string, patterns: string[]) {
    if (patterns.length === 0) {
      return true;
    }

    const normalizedPath = filePath.toLowerCase();
    const fileName = path.basename(filePath).toLowerCase();

    return patterns.some((rawPattern) => {
      const pattern = this.cleanString(rawPattern).toLowerCase();
      if (!pattern) {
        return false;
      }

      if (pattern.startsWith('*.') && pattern.length > 2) {
        return fileName.endsWith(pattern.slice(1));
      }

      if (pattern.includes('*')) {
        const regex = new RegExp(`^${this.escapeRegex(pattern).replace(/\\\*/g, '.*')}$`);
        return regex.test(fileName) || regex.test(normalizedPath);
      }

      return fileName.includes(pattern) || normalizedPath.includes(pattern);
    });
  }

  private isTextLikeFile(filePath: string) {
    const extension = path.extname(filePath).toLowerCase();
    return ['.md', '.txt', '.json', '.csv', '.yaml', '.yml', '.html', '.htm', '.log'].includes(extension);
  }

  private chunkContent(content: string, chunkSize = 1200, overlap = 150) {
    const text = String(content ?? '').trim();
    if (!text) {
      return [];
    }

    if (text.length <= chunkSize) {
      return [text];
    }

    const chunks: string[] = [];
    let pointer = 0;
    while (pointer < text.length) {
      const end = Math.min(pointer + chunkSize, text.length);
      chunks.push(text.slice(pointer, end));
      if (end >= text.length) {
        break;
      }
      pointer = Math.max(end - overlap, pointer + 1);
    }
    return chunks;
  }

  private stripHtml(input: string) {
    return String(input ?? '')
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractUrlTitle(url: string) {
    try {
      const parsed = new URL(url);
      return parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname;
    } catch {
      return url;
    }
  }

  private canAccessKnowledge(
    item: {
      scopeType?: string | null;
      scopeRefIds?: unknown;
      allowedRoles?: unknown;
      document?: {
        scopeType?: string | null;
        scopeRefIds?: unknown;
        allowedRoles?: unknown;
      };
    },
    access: AssistantEffectiveAccess
  ) {
    const resource = item.document ?? item;
    return canAccessAclResource(access, {
      scopeType: resource.scopeType,
      scopeRefIds: resource.scopeRefIds,
      allowedRoles: resource.allowedRoles
    });
  }

  private ensureRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private take(limitRaw: number | undefined) {
    const parsed = Number(limitRaw ?? 50);
    if (!Number.isFinite(parsed)) {
      return 50;
    }
    return Math.min(Math.max(Math.trunc(parsed), 1), 200);
  }

  private resolveMaxFiles(maxFilesRaw: number | undefined) {
    const parsed = Number(maxFilesRaw ?? 200);
    if (!Number.isFinite(parsed)) {
      return 200;
    }
    return Math.min(Math.max(Math.trunc(parsed), 1), 1000);
  }

  private estimateTokenCount(content: string) {
    const text = String(content ?? '').trim();
    if (!text) {
      return 0;
    }
    return Math.ceil(text.length / 4);
  }

  private cleanString(value: unknown) {
    return String(value ?? '').trim();
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
