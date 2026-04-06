'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiRequest, normalizeListPayload } from '../lib/api-client';
import { formatRuntimeDateTime } from '../lib/runtime-format';
import { getZaloAutomationSocket, resolveZaloAutomationOrgId } from '../lib/zalo-automation-socket';
import { useAccessPolicy } from './access-policy-context';
import { Badge, statusToBadge } from './ui';

type ConversationChannel = 'ZALO_PERSONAL' | 'ZALO_OA' | 'FACEBOOK' | 'OTHER';
type ZaloPermissionLevel = 'READ' | 'CHAT' | 'ADMIN';

type ThreadRow = {
  id: string;
  channel: ConversationChannel;
  channelAccountId?: string | null;
  externalThreadId: string;
  customerDisplayName?: string | null;
  unreadCount?: number | null;
  lastMessageAt?: string | null;
  customer?: {
    fullName?: string | null;
    phone?: string | null;
  } | null;
  channelAccount?: {
    displayName?: string | null;
    status?: string | null;
  } | null;
};

type MessageRow = {
  id: string;
  senderType?: string | null;
  senderName?: string | null;
  content?: string | null;
  contentType?: string | null;
  attachmentsJson?: unknown;
  isDeleted?: boolean;
  sentAt?: string | null;
};

type ZaloAccount = {
  id: string;
  displayName?: string | null;
  zaloUid?: string | null;
  accountType?: string | null;
  status?: string | null;
  currentPermissionLevel?: ZaloPermissionLevel | null;
};

type SocketChatMessagePayload = {
  accountId?: string;
  conversationId?: string;
  message?: MessageRow;
};

type SocketChatDeletedPayload = {
  accountId?: string;
  msgId?: string;
};

const CHANNEL_LABELS: Record<ConversationChannel, string> = {
  ZALO_PERSONAL: 'Zalo cá nhân',
  ZALO_OA: 'Zalo OA',
  FACEBOOK: 'Facebook',
  OTHER: 'Kênh khác'
};

function toDateTime(value: string | null | undefined) {
  if (!value) {
    return '--';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return formatRuntimeDateTime(parsed.toISOString());
}

function normalizePermission(value: string | null | undefined) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'READ' || normalized === 'CHAT' || normalized === 'ADMIN') {
    return normalized as ZaloPermissionLevel;
  }
  return null;
}

function permissionBadge(permission: ZaloPermissionLevel | null | undefined) {
  if (permission === 'ADMIN') {
    return 'success' as const;
  }
  if (permission === 'CHAT') {
    return 'info' as const;
  }
  if (permission === 'READ') {
    return 'warning' as const;
  }
  return 'neutral' as const;
}

function isOutgoingMessage(message: MessageRow) {
  const senderType = String(message.senderType ?? '').trim().toUpperCase();
  if (senderType === 'AGENT' || senderType === 'STAFF' || senderType === 'ADMIN' || senderType === 'SYSTEM') {
    return true;
  }
  return false;
}

function toSafeRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toOptionalNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === '') {
      continue;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      continue;
    }
    return Math.trunc(parsed);
  }
  return null;
}

function parseLegacyStickerPayload(rawContent: string | null | undefined) {
  const raw = String(rawContent ?? '').trim();
  if (!raw || raw.length > 600 || !raw.startsWith('{') || !raw.endsWith('}')) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    const payload = toSafeRecord(parsed);
    if (!payload) {
      return null;
    }
    const stickerId = toOptionalNumber(payload.id, payload.stickerId, payload.sticker_id);
    if (stickerId === null) {
      return null;
    }
    const catId = toOptionalNumber(payload.catId, payload.cateId, payload.cate_id);
    const stickerType = toOptionalNumber(payload.type, payload.stickerType, payload.sticker_type);
    if (catId === null && stickerType === null) {
      return null;
    }
    return {
      id: stickerId,
      catId,
      type: stickerType
    };
  } catch {
    return null;
  }
}

function resolveStickerRenderData(message: MessageRow) {
  const normalizedContentType = String(message.contentType ?? '').trim().toUpperCase();
  const attachments = toSafeRecord(message.attachmentsJson);
  const sticker = toSafeRecord(attachments?.sticker);
  const legacySticker = parseLegacyStickerPayload(message.content);

  const stickerId = toOptionalNumber(sticker?.id, legacySticker?.id);
  const previewUrl =
    String(
      sticker?.previewUrl
      ?? sticker?.stickerWebpUrl
      ?? sticker?.stickerUrl
      ?? sticker?.stickerSpriteUrl
      ?? ''
    ).trim() || null;
  const stickerText = String(sticker?.text ?? '').trim();
  const fallbackText = stickerText || (stickerId !== null ? `[Sticker #${stickerId}]` : '[Sticker]');
  const shouldTreatAsSticker = normalizedContentType === 'STICKER' || Boolean(sticker) || Boolean(legacySticker);

  if (!shouldTreatAsSticker) {
    return null;
  }

  return {
    previewUrl,
    fallbackText,
    alt: stickerText || (stickerId !== null ? `Sticker ${stickerId}` : 'Sticker Zalo')
  };
}

export function ZaloAutomationMessagesWorkbench() {
  const { canModule, canAction } = useAccessPolicy();
  const canView = canModule('crm');
  const canCreate = canAction('crm', 'CREATE');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [zaloAccounts, setZaloAccounts] = useState<ZaloAccount[]>([]);
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);

  const [threadQuery, setThreadQuery] = useState('');
  const [threadAccountId, setThreadAccountId] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState('');
  const [sendMessageContent, setSendMessageContent] = useState('');

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [threads, selectedThreadId]
  );

  const unreadByAccount = useMemo(() => {
    const unreadMap = new Map<string, number>();
    for (const thread of threads) {
      const accountId = String(thread.channelAccountId ?? '').trim();
      if (!accountId) {
        continue;
      }
      const unreadCount = Number(thread.unreadCount ?? 0);
      if (!Number.isFinite(unreadCount) || unreadCount <= 0) {
        continue;
      }
      unreadMap.set(accountId, (unreadMap.get(accountId) ?? 0) + unreadCount);
    }
    return unreadMap;
  }, [threads]);

  const totalUnreadAcrossAccounts = useMemo(
    () => [...unreadByAccount.values()].reduce((sum, value) => sum + value, 0),
    [unreadByAccount]
  );

  const accountsWithUnread = useMemo(
    () =>
      zaloAccounts
        .map((account) => ({
          accountId: account.id,
          displayName: account.displayName || account.zaloUid || account.id,
          unreadCount: unreadByAccount.get(account.id) ?? 0
        }))
        .filter((row) => row.unreadCount > 0)
        .sort((a, b) => b.unreadCount - a.unreadCount),
    [zaloAccounts, unreadByAccount]
  );

  const permissionByAccount = useMemo(() => {
    const map = new Map<string, ZaloPermissionLevel>();
    for (const account of zaloAccounts) {
      const permission = normalizePermission(account.currentPermissionLevel ?? null);
      if (permission) {
        map.set(account.id, permission);
      }
    }
    return map;
  }, [zaloAccounts]);

  const selectedThreadPermission = useMemo(() => {
    if (!selectedThread?.channelAccountId) {
      return null;
    }
    return permissionByAccount.get(selectedThread.channelAccountId) ?? null;
  }, [permissionByAccount, selectedThread]);

  const canSendSelectedThread = useMemo(() => {
    if (!selectedThread || !canCreate) {
      return false;
    }
    if (!selectedThread.channelAccountId) {
      return true;
    }
    return selectedThreadPermission !== 'READ';
  }, [canCreate, selectedThread, selectedThreadPermission]);

  const clearNotice = () => {
    setErrorMessage(null);
    setResultMessage(null);
  };

  const loadAccounts = async () => {
    try {
      const payload = await apiRequest<ZaloAccount[]>('/zalo/accounts', {
        query: {
          accountType: 'ALL'
        }
      });
      const rows = (normalizeListPayload(payload) as ZaloAccount[]).map((row) => ({
        ...row,
        currentPermissionLevel: normalizePermission(row.currentPermissionLevel ?? null)
      }));
      setZaloAccounts(rows);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được tài khoản Zalo.');
    }
  };

  const loadThreads = async () => {
    setIsLoadingThreads(true);
    try {
      const payload = await apiRequest<{ items?: ThreadRow[] }>('/conversations/threads', {
        query: {
          q: threadQuery || undefined,
          channel: 'ALL',
          channelAccountId: threadAccountId || undefined,
          limit: 80
        }
      });
      const rows = (normalizeListPayload(payload) as ThreadRow[])
        .filter((row) => row.channel === 'ZALO_PERSONAL' || row.channel === 'ZALO_OA');
      setThreads(rows);
      setSelectedThreadId((prev) => {
        if (prev && rows.some((thread) => thread.id === prev)) {
          return prev;
        }
        return rows[0]?.id ?? '';
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được danh sách hội thoại.');
    } finally {
      setIsLoadingThreads(false);
    }
  };

  const loadMessages = async (threadId: string) => {
    setIsLoadingMessages(true);
    try {
      const payload = await apiRequest<{ items?: MessageRow[] }>(`/conversations/threads/${threadId}/messages`, {
        query: {
          limit: 200
        }
      });
      setMessages(normalizeListPayload(payload) as MessageRow[]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được tin nhắn hội thoại.');
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const refreshAll = async () => {
    clearNotice();
    await Promise.all([loadAccounts(), loadThreads()]);
  };

  useEffect(() => {
    if (!canView) {
      return;
    }
    void refreshAll();
  }, [canView]);

  useEffect(() => {
    if (!canView) {
      return;
    }
    void loadThreads();
  }, [canView, threadQuery, threadAccountId]);

  useEffect(() => {
    if (!canView || !selectedThreadId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedThreadId);
  }, [canView, selectedThreadId]);

  useEffect(() => {
    if (!canView) {
      return;
    }
    const socket = getZaloAutomationSocket();
    if (!socket) {
      return;
    }

    const orgId = resolveZaloAutomationOrgId();
    socket.emit('org:join', { orgId });
    if (threadAccountId) {
      socket.emit('zalo:subscribe', { accountId: threadAccountId });
    }

    const onChatMessage = (payload: SocketChatMessagePayload) => {
      if (threadAccountId && payload.accountId && payload.accountId !== threadAccountId) {
        return;
      }
      if (payload.conversationId && payload.conversationId === selectedThreadId) {
        void loadMessages(selectedThreadId);
      }
      void loadThreads();
    };

    const onChatDeleted = (payload: SocketChatDeletedPayload) => {
      if (threadAccountId && payload.accountId && payload.accountId !== threadAccountId) {
        return;
      }
      if (selectedThreadId) {
        void loadMessages(selectedThreadId);
      }
    };

    socket.on('chat:message', onChatMessage);
    socket.on('chat:deleted', onChatDeleted);

    return () => {
      socket.off('chat:message', onChatMessage);
      socket.off('chat:deleted', onChatDeleted);
      if (threadAccountId) {
        socket.emit('zalo:unsubscribe', { accountId: threadAccountId });
      }
    };
  }, [canView, threadAccountId, selectedThreadId]);

  const onSendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearNotice();
    if (!selectedThread) {
      setErrorMessage('Vui lòng chọn hội thoại trước khi gửi tin.');
      return;
    }
    const content = sendMessageContent.trim();
    if (!content) {
      setErrorMessage('Nội dung gửi không được để trống.');
      return;
    }
    if (!canSendSelectedThread) {
      setErrorMessage('Bạn không có quyền gửi tin trên hội thoại này.');
      return;
    }

    try {
      if (selectedThread.channel === 'ZALO_PERSONAL' && selectedThread.channelAccountId) {
        await apiRequest(`/zalo/accounts/${selectedThread.channelAccountId}/personal/messages/send`, {
          method: 'POST',
          body: {
            externalThreadId: selectedThread.externalThreadId,
            content,
            threadType: 'user'
          }
        });
      } else if (selectedThread.channel === 'ZALO_OA' && selectedThread.channelAccountId) {
        await apiRequest(`/zalo/accounts/${selectedThread.channelAccountId}/oa/messages/send`, {
          method: 'POST',
          body: {
            externalThreadId: selectedThread.externalThreadId,
            content
          }
        });
      } else {
        await apiRequest(`/conversations/threads/${selectedThread.id}/messages`, {
          method: 'POST',
          body: {
            senderType: 'AGENT',
            content
          }
        });
      }

      setSendMessageContent('');
      setResultMessage('Đã gửi tin nhắn thành công.');
      await Promise.all([loadThreads(), loadMessages(selectedThread.id)]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể gửi tin nhắn.');
    }
  };

  if (!canView) {
    return null;
  }

  return (
    <article className="module-workbench zalo-chat-workbench" data-testid="zalo-automation-messages-workbench">
      <div className="zalo-chat-toolbar">
        <Link className="btn btn-ghost" href="/modules/zalo-automation/accounts">
          Quản lý tài khoản Zalo
        </Link>
        <Link className="btn btn-ghost" href="/modules/zalo-automation/ai-runs">
          AI đánh giá & Phiên chạy
        </Link>
        <button type="button" className="btn btn-ghost" onClick={() => void refreshAll()}>
          Tải lại
        </button>
      </div>

      {errorMessage ? <p className="banner banner-error">{errorMessage}</p> : null}
      {resultMessage ? <p className="banner banner-success">{resultMessage}</p> : null}

      <section className="zalo-chat-layout">
        <section className="panel-surface crm-panel zalo-chat-conversation-panel">
          <div className="crm-panel-head">
            <h2>Danh sách hội thoại</h2>
            <Badge variant={statusToBadge('active')}>{threads.length} hội thoại</Badge>
          </div>

          <div className="filter-grid">
            <div className="field">
              <label htmlFor="zalo-msg-account-filter">Tài khoản Zalo</label>
              <select
                id="zalo-msg-account-filter"
                value={threadAccountId}
                onChange={(event) => setThreadAccountId(event.target.value)}
              >
                <option value="">
                  Tất cả tài khoản{totalUnreadAcrossAccounts > 0 ? ` • ${totalUnreadAcrossAccounts} chưa đọc` : ''}
                </option>
                {zaloAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.displayName || account.zaloUid || account.id}
                    {(unreadByAccount.get(account.id) ?? 0) > 0 ? ` • ${unreadByAccount.get(account.id)} chưa đọc` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="zalo-msg-search">Tìm kiếm</label>
              <input
                id="zalo-msg-search"
                value={threadQuery}
                onChange={(event) => setThreadQuery(event.target.value)}
                placeholder="Tên khách hàng hoặc thread id"
              />
            </div>
          </div>

          {accountsWithUnread.length > 0 ? (
            <div className="zalo-chat-account-unread-list">
              {accountsWithUnread.map((account) => (
                <div key={account.accountId} className="zalo-chat-account-unread-item">
                  <span>{account.displayName}</span>
                  <span className="zalo-chat-unread-badge">{account.unreadCount}</span>
                </div>
              ))}
            </div>
          ) : null}

          {isLoadingThreads ? <p className="muted">Đang tải hội thoại...</p> : null}
          {!isLoadingThreads && threads.length === 0 ? <p className="muted">Chưa có hội thoại phù hợp.</p> : null}

          {threads.length > 0 ? (
            <div className="zalo-chat-thread-list">
              {threads.map((thread) => {
                const active = thread.id === selectedThreadId;
                const unreadCount = Math.max(0, Number(thread.unreadCount ?? 0) || 0);
                return (
                  <button
                    type="button"
                    key={thread.id}
                    className={`zalo-chat-thread-item ${active ? 'active' : ''}`}
                    onClick={() => setSelectedThreadId(thread.id)}
                  >
                    <div className="zalo-chat-thread-item-head">
                      <div className="zalo-chat-thread-title">
                        {unreadCount > 0 ? <span className="zalo-chat-unread-badge">{unreadCount}</span> : null}
                        <strong>{thread.customerDisplayName || thread.customer?.fullName || 'Khách hàng'}</strong>
                      </div>
                      <span>{toDateTime(thread.lastMessageAt)}</span>
                    </div>
                    <div className="zalo-chat-thread-item-meta">
                      <span>{CHANNEL_LABELS[thread.channel] ?? thread.channel}</span>
                    </div>
                    <div className="zalo-chat-thread-item-meta">
                      <span>{thread.channelAccount?.displayName || thread.channelAccountId || '--'}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>

        <section className="panel-surface crm-panel zalo-chat-message-panel">
          <div className="crm-panel-head">
            <h2>Luồng tin nhắn</h2>
            <Badge variant={permissionBadge(selectedThreadPermission)}>
              Quyền hiện tại: {selectedThreadPermission || '--'}
            </Badge>
          </div>

          <p className="muted">
            Hội thoại: {selectedThread?.customerDisplayName || selectedThread?.externalThreadId || '--'}
          </p>
          <p className="muted">
            Tài khoản: {selectedThread?.channelAccount?.displayName || selectedThread?.channelAccountId || '--'}
          </p>

          {isLoadingMessages ? <p className="muted">Đang tải tin nhắn...</p> : null}
          {!isLoadingMessages && messages.length === 0 ? <p className="muted">Chưa có tin nhắn.</p> : null}

          {messages.length > 0 ? (
            <div className="zalo-chat-message-list">
              {[...messages].reverse().map((message) => {
                const outgoing = isOutgoingMessage(message);
                const senderLabel = String(message.senderName ?? '').trim() || message.senderType || '--';
                const stickerRender = resolveStickerRenderData(message);

                return (
                  <article
                    key={message.id}
                    className={`zalo-chat-message-item ${outgoing ? 'outgoing' : 'incoming'}`}
                    data-message-direction={outgoing ? 'outgoing' : 'incoming'}
                  >
                    <header>
                      <strong>{senderLabel}</strong>
                      <span>{toDateTime(message.sentAt)}</span>
                    </header>
                    <p className={message.isDeleted ? 'muted' : ''}>
                      {message.isDeleted ? 'Tin nhắn đã bị thu hồi.' : null}
                      {!message.isDeleted && stickerRender?.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={stickerRender.previewUrl}
                          alt={stickerRender.alt}
                          className="zalo-chat-message-sticker"
                          loading="lazy"
                        />
                      ) : null}
                      {!message.isDeleted && !stickerRender?.previewUrl ? (
                        stickerRender?.fallbackText || message.content || '--'
                      ) : null}
                    </p>
                  </article>
                );
              })}
            </div>
          ) : null}

          <form className="form-grid" onSubmit={onSendMessage}>
            <div className="field">
              <label htmlFor="zalo-message-content">Nội dung</label>
              <textarea
                id="zalo-message-content"
                value={sendMessageContent}
                onChange={(event) => setSendMessageContent(event.target.value)}
                placeholder="Nhập nội dung gửi phản hồi khách hàng..."
              />
            </div>
            <div className="action-buttons">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!selectedThread || !canSendSelectedThread}
                data-testid="zalo-message-send-button"
              >
                Gửi tin nhắn
              </button>
            </div>
          </form>
        </section>
      </section>
    </article>
  );
}
