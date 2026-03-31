import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditOperationType } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { Observable, tap } from 'rxjs';
import { AUTH_USER_CONTEXT_KEY, REQUEST_ID_CONTEXT_KEY } from '../request/request.constants';
import { TENANT_CONTEXT_KEY } from '../tenant/tenant.constants';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AUDIT_ACTION_CONTEXT_KEY,
  AUDIT_ACTION_METADATA_KEY,
  AUDIT_READ_METADATA_KEY,
  AUDIT_REQUEST_CONTEXT_KEY
} from './audit.constants';
import { AuditActionContext, AuditActionMetadata, AuditReadMetadata, AuditRequestContext } from './audit.types';

@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  constructor(
    @Inject(ClsService) private readonly cls: ClsService,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<{
      method: string;
      originalUrl?: string;
      url?: string;
      ip?: string;
      headers: Record<string, string | string[] | undefined>;
      params?: Record<string, string | undefined>;
      query?: Record<string, string | string[] | undefined>;
    }>();
    const response = http.getResponse<{ statusCode?: number }>();

    const route = String(request.originalUrl ?? request.url ?? '');
    const moduleKey = this.resolveModuleKey(route);
    const tenantId = this.cleanString(this.cls.get<string>(TENANT_CONTEXT_KEY)) || this.prisma.getTenantId();
    const requestId = this.cleanString(this.cls.get<string>(REQUEST_ID_CONTEXT_KEY)) || null;

    const auditRequestContext: AuditRequestContext = {
      tenantId,
      module: moduleKey,
      requestId,
      route,
      method: String(request.method ?? '').toUpperCase(),
      ip: this.cleanString(request.ip) || null,
      userAgent: this.extractFirstHeaderValue(request.headers['user-agent']) || null,
      params: this.normalizeStringRecord(request.params),
      query: this.normalizeQueryRecord(request.query)
    };
    this.cls.set(AUDIT_REQUEST_CONTEXT_KEY, auditRequestContext);

    const actionMetadata = this.reflector.getAllAndOverride<AuditActionMetadata | undefined>(AUDIT_ACTION_METADATA_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (actionMetadata) {
      const actionContext: AuditActionContext = {
        ...actionMetadata,
        module: this.cleanString(actionMetadata.module) || moduleKey,
        entityType: this.cleanString(actionMetadata.entityType) || undefined,
        entityId: this.resolveEntityIdFromParam(actionMetadata.entityIdParam, request.params)
      };
      this.cls.set(AUDIT_ACTION_CONTEXT_KEY, actionContext);
    }

    const readMetadata = this.reflector.getAllAndOverride<AuditReadMetadata | undefined>(AUDIT_READ_METADATA_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    return next.handle().pipe(
      tap({
        next: () => {
          if (!readMetadata) {
            return;
          }

          const authUser = this.readAuthUser();
          void this.prisma.appendAuditLog({
            tenantId,
            module: this.cleanString(readMetadata.module) || moduleKey,
            entityType: this.cleanString(readMetadata.entityType) || 'SensitiveRead',
            entityId: this.resolveEntityIdFromParam(readMetadata.entityIdParam, request.params),
            action: this.cleanString(readMetadata.action) || 'SENSITIVE_READ',
            operationType: AuditOperationType.READ,
            actorId: authUser.actorId,
            actorRole: authUser.actorRole,
            requestId,
            route,
            method: String(request.method ?? '').toUpperCase(),
            statusCode: typeof response.statusCode === 'number' ? response.statusCode : null,
            ip: this.cleanString(request.ip) || null,
            userAgent: this.extractFirstHeaderValue(request.headers['user-agent']) || null,
            metadata: {
              query: this.normalizeQueryRecord(request.query),
              ...(readMetadata.metadata ?? {})
            }
          }).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[AuditRead] Failed to persist audit read log: ${message}`);
          });
        }
      })
    );
  }

  private resolveModuleKey(pathRaw: string) {
    const path = String(pathRaw ?? '').split('?')[0].replace(/^\/api\/v1\//i, '');
    const [moduleKey] = path.split('/').filter(Boolean);
    return moduleKey ? moduleKey.toLowerCase() : 'system';
  }

  private resolveEntityIdFromParam(entityIdParam: string | undefined, params: Record<string, string | undefined> | undefined) {
    if (!entityIdParam) {
      return null;
    }
    if (!params) {
      return null;
    }
    const value = params[entityIdParam];
    return this.cleanString(value) || null;
  }

  private normalizeStringRecord(source: Record<string, string | undefined> | undefined) {
    if (!source) {
      return {};
    }

    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(source)) {
      if (!value) {
        continue;
      }
      out[key] = String(value);
    }
    return out;
  }

  private normalizeQueryRecord(source: Record<string, string | string[] | undefined> | undefined) {
    if (!source) {
      return {};
    }

    const out: Record<string, string | string[] | undefined> = {};
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) {
        continue;
      }
      out[key] = Array.isArray(value) ? value.map((item) => String(item)) : String(value);
    }
    return out;
  }

  private extractFirstHeaderValue(value: string | string[] | undefined) {
    if (Array.isArray(value)) {
      return value[0] ? String(value[0]) : '';
    }
    return this.cleanString(value);
  }

  private cleanString(value: unknown) {
    return String(value ?? '').trim();
  }

  private readAuthUser() {
    const authUser = this.cls.get<Record<string, unknown> | undefined>(AUTH_USER_CONTEXT_KEY) ?? {};
    const actorId = this.cleanString(authUser.userId ?? authUser.sub) || null;
    const actorRole = this.cleanString(authUser.role) || null;
    return {
      actorId,
      actorRole
    };
  }
}
