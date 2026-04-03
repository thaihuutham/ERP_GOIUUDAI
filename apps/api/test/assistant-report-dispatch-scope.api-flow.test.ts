import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PermissionAction, UserRole } from '@prisma/client';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { RuntimeSettingsService } from '../src/common/settings/runtime-settings.service';
import { AssistantAuthzService } from '../src/modules/assistant/assistant-authz.service';
import { AssistantKnowledgeService } from '../src/modules/assistant/assistant-knowledge.service';
import { AssistantProxyService } from '../src/modules/assistant/assistant-proxy.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { makeAuthToken, setupSingleTenantAuthTestEnv } from './auth-test.helper';

describe('Assistant report-dispatch scope mismatch integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authz: AssistantAuthzService;
  let knowledgeService: AssistantKnowledgeService;
  let proxyService: AssistantProxyService;
  let runtimeSettings: RuntimeSettingsService;

  beforeAll(async () => {
    setupSingleTenantAuthTestEnv('assistant-dispatch-scope-secret');

    app = await NestFactory.create(AppModule, {
      logger: false,
      abortOnError: false
    });

    app.setGlobalPrefix('api/v1');
    app.enableCors();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true
      })
    );

    await app.init();

    prisma = app.get(PrismaService);
    authz = app.get(AssistantAuthzService);
    knowledgeService = app.get(AssistantKnowledgeService);
    proxyService = app.get(AssistantProxyService);
    runtimeSettings = app.get(RuntimeSettingsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps chat artifact undispatched when channel scope is outside artifact scope', async () => {
    const token = makeAuthToken('ADMIN');
    const now = new Date('2026-04-01T10:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const access = {
      actor: {
        userId: 'admin_actor_1',
        email: 'admin1@example.com',
        role: UserRole.ADMIN,
        tenantId: 'GOIUUDAI',
        employeeId: 'emp_admin_1',
        positionId: 'pos_admin_1'
      },
      scope: {
        type: 'company' as const,
        orgUnitIds: [],
        employeeIds: [],
        actorIds: [],
        scopeRefIds: []
      },
      allowedModules: ['sales', 'reports'],
      moduleActions: {
        sales: [PermissionAction.VIEW],
        reports: [PermissionAction.VIEW, PermissionAction.CREATE]
      },
      policy: {
        enforcePermissionEngine: true,
        denyIfNoScope: true,
        chatChannelScopeEnforced: true
      }
    };

    const createdRuns: Array<Record<string, unknown>> = [];
    const createdArtifacts: Array<Record<string, unknown>> = [];

    vi.spyOn(runtimeSettings, 'isModuleEnabled').mockResolvedValue(true);
    vi.spyOn(authz, 'resolveCurrentAccess').mockResolvedValue(access);
    vi.spyOn(authz, 'assertModulePermission').mockImplementation(() => undefined);

    vi.spyOn(proxyService, 'getSalesSnapshot').mockResolvedValue({
      orders: [],
      invoices: []
    } as any);
    vi.spyOn(knowledgeService, 'retrieveContext').mockResolvedValue({
      count: 0,
      documents: [],
      chunks: []
    } as any);

    vi.spyOn(prisma.client.assistantReportRun, 'create').mockImplementation(async (args: any) => {
      const run = {
        id: `run_${createdRuns.length + 1}`,
        tenant_Id: 'GOIUUDAI',
        runType: args.data.runType,
        reportPacksJson: args.data.reportPacksJson,
        status: args.data.status,
        requestedBy: args.data.requestedBy,
        accessSnapshotJson: args.data.accessSnapshotJson,
        summaryJson: args.data.summaryJson,
        startedAt: args.data.startedAt,
        completedAt: args.data.completedAt,
        createdAt: now,
        updatedAt: now
      };
      createdRuns.push(run);
      return run as any;
    });

    vi.spyOn(prisma.client.assistantReportArtifact, 'create').mockImplementation(async (args: any) => {
      const artifact = {
        id: `artifact_${createdArtifacts.length + 1}`,
        tenant_Id: 'GOIUUDAI',
        runId: args.data.runId,
        artifactType: args.data.artifactType,
        scopeType: args.data.scopeType,
        scopeRefIds: args.data.scopeRefIds ?? [],
        status: args.data.status,
        contentJson: args.data.contentJson,
        channelId: null,
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        publishedAt: args.data.publishedAt ?? null,
        createdAt: now,
        updatedAt: now
      };
      createdArtifacts.push(artifact);
      return artifact as any;
    });

    vi.spyOn(prisma.client.assistantReportArtifact, 'findFirst').mockImplementation(async (args: any) => {
      const id = String(args?.where?.id ?? '');
      const artifact = createdArtifacts.find((item) => String(item.id) === id);
      if (!artifact) {
        return null;
      }
      return {
        ...artifact,
        run: createdRuns.find((item) => String(item.id) === String(artifact.runId)) ?? null
      } as any;
    });

    const updateArtifactSpy = vi.spyOn(prisma.client.assistantReportArtifact, 'updateMany').mockResolvedValue({
      count: 0
    } as any);

    vi.spyOn(prisma.client.assistantDispatchChannel, 'findMany').mockResolvedValue([
      {
        id: 'channel_self_scope',
        tenant_Id: 'GOIUUDAI',
        name: 'Self Scope Channel',
        channelType: 'WEBHOOK',
        endpointUrl: 'https://example.invalid/webhook',
        webhookSecretRef: null,
        scopeType: 'self',
        scopeRefIds: ['another_actor'],
        allowedReportPacks: ['sales'],
        metadataJson: null,
        isActive: true,
        lastTestedAt: null,
        createdAt: now,
        updatedAt: now
      }
    ] as any);

    const attemptFindSpy = vi.spyOn(prisma.client.assistantDispatchAttempt, 'findFirst').mockResolvedValue(null);
    const attemptCreateSpy = vi.spyOn(prisma.client.assistantDispatchAttempt, 'create').mockResolvedValue({
      id: 'attempt_1'
    } as any);
    const attemptUpdateSpy = vi.spyOn(prisma.client.assistantDispatchAttempt, 'updateMany').mockResolvedValue({
      count: 0
    } as any);

    vi.spyOn(prisma.client.assistantReportRun, 'findFirst').mockImplementation(async (args: any) => {
      const runId = String(args?.where?.id ?? '');
      const run = createdRuns.find((item) => String(item.id) === runId);
      if (!run) {
        return null;
      }
      return {
        ...run,
        artifacts: createdArtifacts
          .filter((artifact) => String(artifact.runId) === runId)
          .map((artifact) => ({
            ...artifact,
            dispatchAttempts: []
          }))
      } as any;
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const createRunRes = await request(app.getHttpServer())
      .post('/api/v1/assistant/reports/runs')
      .set('authorization', `Bearer ${token}`)
      .send({
        runType: 'MANUAL',
        reportPacks: ['sales'],
        dispatchChat: true
      });

    expect(createRunRes.status).toBe(201);
    expect(createRunRes.body.artifacts.chatArtifactId).toBeTruthy();

    const runId = String(createRunRes.body.runId);
    const getRunRes = await request(app.getHttpServer())
      .get(`/api/v1/assistant/reports/runs/${runId}`)
      .set('authorization', `Bearer ${token}`);

    expect(getRunRes.status).toBe(200);

    const chatArtifact = (getRunRes.body.artifacts as Array<Record<string, unknown>>)
      .find((artifact) => artifact.artifactType === 'CHAT');

    expect(chatArtifact).toBeTruthy();
    expect(chatArtifact?.dispatchAttempts).toEqual([]);
    expect(chatArtifact?.channelId).toBeNull();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(attemptFindSpy).not.toHaveBeenCalled();
    expect(attemptCreateSpy).not.toHaveBeenCalled();
    expect(attemptUpdateSpy).not.toHaveBeenCalled();
    expect(updateArtifactSpy).not.toHaveBeenCalled();

  });
});
