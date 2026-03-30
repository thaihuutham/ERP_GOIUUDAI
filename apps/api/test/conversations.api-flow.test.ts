import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConversationChannel, ConversationSenderType } from '@prisma/client';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { ConversationsService } from '../src/modules/conversations/conversations.service';
import { ZaloService } from '../src/modules/zalo/zalo.service';

describe('Conversations API flow integration', () => {
  let app: INestApplication;
  let conversationsService: ConversationsService;
  let zaloService: ZaloService;

  const makeToken = (role: 'ADMIN' | 'MANAGER' | 'STAFF') =>
    sign(
      {
        sub: `test_${role.toLowerCase()}`,
        userId: `test_${role.toLowerCase()}`,
        email: `${role.toLowerCase()}@example.com`,
        role,
        tenantId: 'tenant_demo_company'
      },
      process.env.JWT_SECRET as string,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.AUTH_ENABLED = 'true';
    process.env.JWT_SECRET = 'phase-crm-conversations-flow-secret';
    process.env.PRISMA_SKIP_CONNECT = 'true';

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
    conversationsService = app.get(ConversationsService);
    zaloService = app.get(ZaloService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('executes conversations inbox flow: list -> create thread -> list/append messages -> latest evaluation', async () => {
    const managerToken = makeToken('MANAGER');

    vi.spyOn(conversationsService, 'listThreads').mockResolvedValue({
      items: [
        {
          id: 'thread_api_1',
          channel: ConversationChannel.ZALO_OA,
          externalThreadId: 'oa_thread_001',
          customerDisplayName: 'Tran Thi B',
          unreadCount: 1
        }
      ],
      nextCursor: null,
      limit: 30
    } as any);

    vi.spyOn(conversationsService, 'createThread').mockResolvedValue({
      id: 'thread_api_2',
      channel: ConversationChannel.ZALO_OA,
      externalThreadId: 'oa_thread_002',
      customerDisplayName: 'Le Van C',
      unreadCount: 0
    } as any);

    vi.spyOn(conversationsService, 'listMessages').mockResolvedValue({
      items: [
        {
          id: 'msg_api_1',
          threadId: 'thread_api_2',
          senderType: ConversationSenderType.CUSTOMER,
          content: 'Em cần tư vấn sản phẩm.',
          contentType: 'TEXT'
        }
      ],
      nextCursor: null,
      limit: 50
    } as any);

    vi.spyOn(conversationsService, 'appendMessage').mockResolvedValue({
      id: 'msg_api_2',
      threadId: 'thread_api_2',
      senderType: ConversationSenderType.AGENT,
      content: 'Dạ em hỗ trợ ngay ạ.',
      contentType: 'TEXT'
    } as any);

    vi.spyOn(conversationsService, 'getLatestEvaluation').mockResolvedValue({
      thread: {
        id: 'thread_api_2',
        externalThreadId: 'oa_thread_002'
      },
      evaluation: {
        id: 'eval_api_1',
        verdict: 'PASS',
        score: 92,
        summary: 'Tư vấn đúng quy trình.'
      }
    } as any);

    const listThreadsRes = await request(app.getHttpServer())
      .get('/api/v1/conversations/threads?channel=ALL&limit=30')
      .set('authorization', `Bearer ${managerToken}`);

    expect(listThreadsRes.status).toBe(200);
    expect(listThreadsRes.body.items).toHaveLength(1);
    expect(listThreadsRes.body.items[0].id).toBe('thread_api_1');

    const createThreadRes = await request(app.getHttpServer())
      .post('/api/v1/conversations/threads')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        channel: 'ZALO_OA',
        externalThreadId: 'oa_thread_002',
        customerDisplayName: 'Le Van C'
      });

    expect(createThreadRes.status).toBe(201);
    expect(createThreadRes.body.id).toBe('thread_api_2');

    const listMessagesRes = await request(app.getHttpServer())
      .get('/api/v1/conversations/threads/thread_api_2/messages?limit=50')
      .set('authorization', `Bearer ${managerToken}`);

    expect(listMessagesRes.status).toBe(200);
    expect(listMessagesRes.body.items).toHaveLength(1);
    expect(listMessagesRes.body.items[0].id).toBe('msg_api_1');

    const appendMessageRes = await request(app.getHttpServer())
      .post('/api/v1/conversations/threads/thread_api_2/messages')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        senderType: 'AGENT',
        content: 'Dạ em hỗ trợ ngay ạ.'
      });

    expect(appendMessageRes.status).toBe(201);
    expect(appendMessageRes.body.id).toBe('msg_api_2');

    const latestEvaluationRes = await request(app.getHttpServer())
      .get('/api/v1/conversations/threads/thread_api_2/evaluation/latest')
      .set('authorization', `Bearer ${managerToken}`);

    expect(latestEvaluationRes.status).toBe(200);
    expect(latestEvaluationRes.body.evaluation.id).toBe('eval_api_1');
    expect(latestEvaluationRes.body.evaluation.score).toBe(92);
  });

  it('executes OA outbound send route via Zalo API endpoint', async () => {
    const managerToken = makeToken('MANAGER');

    vi.spyOn(zaloService, 'sendOaMessage').mockResolvedValue({
      success: true,
      messageId: 'oa_out_001',
      message: {
        id: 'msg_api_oa_1',
        content: 'Xin chào từ OA'
      },
      delivery: {
        requestId: 'req-oa-001'
      }
    } as any);

    const sendRes = await request(app.getHttpServer())
      .post('/api/v1/zalo/accounts/oa_account_1/oa/messages/send')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        threadId: 'thread_api_2',
        message: 'Xin chào từ OA'
      });

    expect(sendRes.status).toBe(201);
    expect(sendRes.body.success).toBe(true);
    expect(sendRes.body.messageId).toBe('oa_out_001');
    expect(sendRes.body.delivery.requestId).toBe('req-oa-001');
  });
});
