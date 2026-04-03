import { randomUUID } from 'crypto';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClsModule } from 'nestjs-cls';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { TENANT_CONTEXT_KEY } from './common/tenant/tenant.constants';
import { resolveTenantIdFromRequest } from './common/tenant/tenant-context.util';
import { REQUEST_ID_CONTEXT_KEY } from './common/request/request.constants';
import { PrismaCrudService } from './common/prisma-crud.service';
import { AuditContextInterceptor } from './common/audit/audit-context.interceptor';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { PermissionGuard } from './common/auth/permission.guard';
import { ModuleAvailabilityGuard } from './common/auth/module-availability.guard';
import { RuntimeSettingsModule } from './common/settings/runtime-settings.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AssetsModule } from './modules/assets/assets.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CrmModule } from './modules/crm/crm.module';
import { FinanceModule } from './modules/finance/finance.module';
import { HrModule } from './modules/hr/hr.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SalesModule } from './modules/sales/sales.module';
import { ScmModule } from './modules/scm/scm.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SearchModule } from './modules/search/search.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { ZaloModule } from './modules/zalo/zalo.module';
import { ConversationQualityModule } from './modules/conversation-quality/conversation-quality.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { AssistantModule } from './modules/assistant/assistant.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Keep both root-level and workspace-level paths so local runs work
      // regardless of whether command is executed from repo root or apps/api.
      envFilePath: [
        '.env',
        'config/.env',
        'config/.env.example',
        '../../.env',
        '../../config/.env',
        '../../config/.env.example'
      ]
    }),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        setup: (cls, req) => {
          cls.set(TENANT_CONTEXT_KEY, resolveTenantIdFromRequest(req as any));
          const requestIdHeader = (req as { headers?: Record<string, unknown> }).headers?.['x-request-id'];
          const requestId = typeof requestIdHeader === 'string' && requestIdHeader.trim()
            ? requestIdHeader.trim()
            : randomUUID();
          cls.set(REQUEST_ID_CONTEXT_KEY, requestId);
        }
      }
    }),
    PrismaModule,
    RuntimeSettingsModule,
    HealthModule,
    CrmModule,
    CatalogModule,
    SalesModule,
    HrModule,
    FinanceModule,
    ScmModule,
    AssetsModule,
    ProjectsModule,
    WorkflowsModule,
    ReportsModule,
    SearchModule,
    SettingsModule,
    AuthModule,
    AuditModule,
    AssistantModule,
    NotificationsModule,
    ConversationsModule,
    ZaloModule,
    ConversationQualityModule
  ],
  providers: [
    PrismaCrudService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard
    },
    {
      provide: APP_GUARD,
      useClass: ModuleAvailabilityGuard
    },
    {
      provide: APP_GUARD,
      useClass: PermissionGuard
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditContextInterceptor
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor
    },
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter
    }
  ]
})
export class AppModule implements NestModule {
  configure(_: MiddlewareConsumer) {
    // Tenant resolution is mounted via nestjs-cls middleware setup.
    // To support true multi-company JWT/SSO later, replace resolveTenantIdFromRequest logic only.
  }
}
