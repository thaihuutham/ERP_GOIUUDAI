import { describe, expect, it, vi } from 'vitest';
import { ZaloPersonalPoolService } from '../src/modules/zalo/zalo-personal.pool.service';

function createService(overrides?: { conversationsService?: any }) {
  return new ZaloPersonalPoolService(
    {} as any,
    overrides?.conversationsService ?? ({} as any),
    {} as any,
    {
      hasAgentReplyAfter: vi.fn(async () => false),
      generateReplyForThread: vi.fn(async () => null)
    } as any
  ) as any;
}

describe('ZaloPersonalPoolService timestamp normalization', () => {
  it('normalizes seconds timestamp to milliseconds', () => {
    const service = createService();
    const parsed = service.parseZaloSentAt(1_710_000_000);
    expect(parsed.getTime()).toBe(1_710_000_000_000);
  });

  it('keeps milliseconds timestamp unchanged', () => {
    const service = createService();
    const parsed = service.parseZaloSentAt(1_710_000_000_123);
    expect(parsed.getTime()).toBe(1_710_000_000_123);
  });

  it('normalizes microseconds timestamp to milliseconds', () => {
    const service = createService();
    const parsed = service.parseZaloSentAt(1_710_000_000_123_000);
    expect(parsed.getTime()).toBe(1_710_000_000_123);
  });
});

describe('ZaloPersonalPoolService sticker normalization', () => {
  it('detects sticker payload and resolves preview metadata', async () => {
    const service = createService();
    const normalized = await service.normalizeIncomingContent(
      { id: 21767, catId: 10320, type: 7 },
      { data: { msgType: 'chat.sticker' } },
      {
        getStickersDetail: async () => [
          {
            id: 21767,
            cateId: 10320,
            type: 7,
            text: 'Sticker chào',
            stickerUrl: 'https://cdn.zalo/sticker/21767.png',
            stickerWebpUrl: 'https://cdn.zalo/sticker/21767.webp'
          }
        ]
      }
    );

    expect(normalized.contentType).toBe('STICKER');
    expect(normalized.content).toBe('Sticker chào');
    expect((normalized.attachmentsJson as any)?.sticker?.id).toBe(21767);
    expect((normalized.attachmentsJson as any)?.sticker?.previewUrl).toBe('https://cdn.zalo/sticker/21767.webp');
  });

  it('falls back to sticker label when detail lookup fails', async () => {
    const service = createService();
    const normalized = await service.normalizeIncomingContent(
      { id: 99001, catId: 12000, type: 7 },
      { data: { msgType: 'chat.sticker' } },
      {
        getStickersDetail: async () => {
          throw new Error('lookup failed');
        }
      }
    );

    expect(normalized.contentType).toBe('STICKER');
    expect(normalized.content).toBe('[Sticker #99001]');
  });
});

describe('ZaloPersonalPoolService sendMessage dedupe safety', () => {
  it('resolves outbound message id from nested send response', () => {
    const service = createService();
    const resolved = service.resolveOutboundMessageId({
      message: {
        msgId: '7696099457179'
      },
      attachment: []
    });
    expect(resolved).toBe('7696099457179');
  });

  it('skips optimistic ingest when send response has no external message id', async () => {
    const conversationsService = {
      ingestExternalMessage: vi.fn(async () => ({}))
    };
    const service = createService({ conversationsService });
    (service as any).instances.set('acc-1', {
      zalo: {},
      api: {
        sendMessage: vi.fn(async () => ({ message: null, attachment: [] }))
      },
      status: 'CONNECTED',
      updatedAt: new Date()
    });

    await service.sendMessage('acc-1', 'thread-1', 'xin chao');

    expect(conversationsService.ingestExternalMessage).not.toHaveBeenCalled();
  });
});
