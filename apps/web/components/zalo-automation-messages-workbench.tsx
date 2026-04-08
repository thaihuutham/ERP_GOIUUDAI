'use client';

import Link from 'next/link';
import { FormEvent, UIEvent, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest, normalizeListPayload, normalizeObjectPayload } from '../lib/api-client';
import { formatRuntimeDateTime } from '../lib/runtime-format';
import { getZaloAutomationSocket, resolveZaloAutomationOrgId } from '../lib/zalo-automation-socket';
import { useAccessPolicy } from './access-policy-context';
import { Modal } from './ui/modal';
import { Badge, statusToBadge } from './ui';
import { SidePanel } from './ui/side-panel';

type ConversationChannel = 'ZALO_PERSONAL' | 'ZALO_OA' | 'FACEBOOK' | 'OTHER';
type ZaloPermissionLevel = 'READ' | 'CHAT' | 'ADMIN';
type ThreadMatchStatus = 'matched' | 'unmatched' | 'suggested';

type ThreadRow = {
  id: string;
  channel: ConversationChannel;
  channelAccountId?: string | null;
  externalThreadId: string;
  customerId?: string | null;
  tags?: string[] | null;
  customerDisplayName?: string | null;
  matchStatus?: ThreadMatchStatus;
  suggestedCustomer?: CustomerPreview | null;
  identityHint?: {
    platform?: string;
    externalUserId?: string;
  } | null;
  unreadCount?: number | null;
  lastMessageAt?: string | null;
  customer?: {
    id?: string | null;
    fullName?: string | null;
    phone?: string | null;
    email?: string | null;
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
  aiAutoReplyEnabled?: boolean | null;
  aiAutoReplyTakeoverMinutes?: number | null;
  currentPermissionLevel?: ZaloPermissionLevel | null;
};

type CustomerPreview = {
  id: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  ownerStaffId?: string | null;
};

type Customer360Payload = {
  customer?: CustomerPreview & {
    code?: string | null;
    customerStage?: string | null;
    source?: string | null;
    segment?: string | null;
    status?: string | null;
    ownerStaffId?: string | null;
    tags?: string[] | null;
    updatedAt?: string | null;
    totalSpent?: number | string | null;
    totalOrders?: number | null;
    lastOrderAt?: string | null;
    lastContactAt?: string | null;
    needsSummary?: string | null;
  };
  socialIdentities?: Array<{
    id: string;
    platform?: string | null;
    externalUserId?: string | null;
    displayName?: string | null;
    phoneHint?: string | null;
  }>;
  contractSummary?: {
    totalContracts?: number;
    activeContracts?: number;
    expiredContracts?: number;
    nextExpiringAt?: string | null;
  } | null;
  vehicles?: Array<{
    id: string;
    plateNumber?: string | null;
    vehicleKind?: string | null;
    status?: string | null;
  }>;
  recentOrders?: Array<{
    id: string;
    orderNo?: string | null;
    totalAmount?: number | string | null;
    createdAt?: string | null;
    status?: string | null;
  }>;
  recentContracts?: Array<{
    id: string;
    productType?: string | null;
    status?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
    sourceRef?: string | null;
    telecomLine?: {
      packageName?: string | null;
      servicePhone?: string | null;
      currentExpiryAt?: string | null;
    } | null;
    autoInsuranceDetail?: {
      soGCN?: string | null;
      vehicleId?: string | null;
    } | null;
    motoInsuranceDetail?: {
      soGCN?: string | null;
      vehicleId?: string | null;
    } | null;
    digitalServiceDetail?: {
      serviceName?: string | null;
      planName?: string | null;
      provider?: string | null;
      serviceAccountRef?: string | null;
    } | null;
  }>;
  recentInteractions?: Array<{
    id: string;
    interactionType?: string | null;
    channel?: string | null;
    content?: string | null;
    resultTag?: string | null;
    interactionAt?: string | null;
    nextActionAt?: string | null;
    staffName?: string | null;
  }>;
  orderSummary?: {
    totalOrders?: number | null;
    totalSpent?: number | string | null;
    lastOrderAt?: string | null;
  } | null;
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

const THREAD_PAGE_LIMIT = 80;
const THREAD_SCROLL_TRIGGER_PX = 96;

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

function toThreadMatchStatus(value: unknown): ThreadMatchStatus {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'matched' || normalized === 'unmatched' || normalized === 'suggested') {
    return normalized as ThreadMatchStatus;
  }
  return 'unmatched';
}

function threadMatchStatusLabel(status: ThreadMatchStatus) {
  if (status === 'matched') {
    return 'Đã nhận diện';
  }
  if (status === 'suggested') {
    return 'Có gợi ý';
  }
  return 'Chưa nhận diện';
}

function threadMatchBadge(status: ThreadMatchStatus) {
  if (status === 'matched') {
    return 'success' as const;
  }
  if (status === 'suggested') {
    return 'warning' as const;
  }
  return 'neutral' as const;
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

function parseTagValues(raw: string) {
  return Array.from(
    new Set(
      raw
        .split(/[\n,;]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  );
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

type ImageRenderData = {
  previewUrl: string;
  alt: string;
  caption: string | null;
};

type FileRenderData = {
  fileUrl: string;
  fileName: string;
  fileSizeBytes: number | null;
  description: string | null;
};

const IMAGE_URL_HINT_KEYS = new Set([
  'thumb',
  'thumbnail',
  'preview',
  'previewurl',
  'image',
  'imageurl',
  'image_url',
  'picture',
  'photo',
  'href',
  'url',
  'src',
  'link'
]);

const FILE_URL_HINT_KEYS = new Set([
  'href',
  'url',
  'link',
  'src',
  'downloadurl',
  'download_url',
  'fileurl',
  'file_url',
  'file',
  'attachment',
  'attachments',
  'resourceurl',
  'resource_url'
]);

const FILE_NAME_HINT_KEYS = new Set([
  'title',
  'name',
  'filename',
  'fileName',
  'file_name',
  'displayName',
  'display_name'
]);

const FILE_SIZE_HINT_KEYS = new Set([
  'filesize',
  'fileSize',
  'size',
  'sizebytes',
  'sizeBytes',
  'contentLength'
]);

const FILE_DESCRIPTION_HINT_KEYS = new Set([
  'description',
  'desc',
  'text',
  'caption',
  'note'
]);

function parseRichMessageObject(rawContent: string | null | undefined) {
  const raw = String(rawContent ?? '').trim();
  if (!raw || raw.length > 20_000 || !raw.startsWith('{') || !raw.endsWith('}')) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return toSafeRecord(parsed);
  } catch {
    return null;
  }
}

function isLikelyImageUrl(value: string) {
  const normalized = value.trim();
  if (!/^https?:\/\//i.test(normalized)) {
    return false;
  }
  if (/\.(png|jpe?g|webp|gif|bmp|avif|heic)(\?|#|$)/i.test(normalized)) {
    return true;
  }
  return normalized.includes('photo-') || normalized.includes('/img/') || normalized.includes('/image');
}

function looksLikeFileName(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 255) {
    return false;
  }
  return /\.[a-z0-9]{2,10}$/i.test(normalized);
}

function isLikelyFileUrl(value: string) {
  const normalized = value.trim();
  if (!/^https?:\/\//i.test(normalized)) {
    return false;
  }
  if (isLikelyImageUrl(normalized)) {
    return false;
  }
  if (/\.(pdf|docx?|xlsx?|pptx?|csv|txt|rtf|zip|rar|7z|tar|gz|json|xml|mp3|wav|mp4|mov|avi|mkv|heic|heif|apk|dmg|exe)(\?|#|$)/i.test(normalized)) {
    return true;
  }
  return normalized.includes('/download') || normalized.includes('/file') || normalized.includes('/attachment');
}

function guessFileNameFromUrl(rawUrl: string) {
  const value = String(rawUrl ?? '').trim();
  if (!value) {
    return '';
  }
  try {
    const parsedUrl = new URL(value);
    const pathnameSegment = parsedUrl.pathname.split('/').filter(Boolean).pop() ?? '';
    const decoded = decodeURIComponent(pathnameSegment);
    if (looksLikeFileName(decoded)) {
      return decoded;
    }
  } catch {
    // ignore invalid URL shape and fallback.
  }
  return '';
}

function normalizeDownloadFileName(rawFileName: string) {
  const trimmed = rawFileName.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 180)
    .trim();
}

function formatFileSize(fileSizeBytes: number | null) {
  if (fileSizeBytes === null || !Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
    return null;
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = fileSizeBytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const rounded = unitIndex === 0 ? String(Math.round(size)) : size.toFixed(size >= 10 ? 1 : 2);
  return `${rounded} ${units[unitIndex]}`;
}

function resolveImageRenderData(message: MessageRow): ImageRenderData | null {
  const imageScores = new Map<string, number>();
  const contentRecord = parseRichMessageObject(message.content);
  const attachmentsRecord = toSafeRecord(message.attachmentsJson);

  const collectImageCandidates = (value: unknown, keyHint: string, depth: number) => {
    if (depth > 6 || imageScores.size > 30) {
      return;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!isLikelyImageUrl(trimmed)) {
        return;
      }
      const keyPriority = IMAGE_URL_HINT_KEYS.has(keyHint.toLowerCase()) ? 18 : 0;
      const extensionPriority = /\.(png|jpe?g|webp|gif|bmp|avif|heic)(\?|#|$)/i.test(trimmed) ? 10 : 4;
      const score = keyPriority + extensionPriority;
      const previous = imageScores.get(trimmed) ?? 0;
      if (score > previous) {
        imageScores.set(trimmed, score);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value.slice(0, 20)) {
        collectImageCandidates(item, keyHint, depth + 1);
      }
      return;
    }

    const record = toSafeRecord(value);
    if (!record) {
      return;
    }

    for (const [key, nestedValue] of Object.entries(record).slice(0, 30)) {
      collectImageCandidates(nestedValue, key, depth + 1);
    }
  };

  collectImageCandidates(attachmentsRecord, '', 0);
  collectImageCandidates(contentRecord, '', 0);
  collectImageCandidates(message.content, '', 0);

  const sortedCandidates = [...imageScores.entries()].sort((left, right) => right[1] - left[1]);
  const previewUrl = sortedCandidates[0]?.[0] ?? null;
  if (!previewUrl) {
    return null;
  }

  const readCaption = (record: Record<string, unknown> | null) => {
    if (!record) {
      return null;
    }
    const keys = ['description', 'caption', 'title', 'text'];
    for (const key of keys) {
      const value = String(record[key] ?? '').trim();
      if (!value || value.length > 280 || isLikelyImageUrl(value)) {
        continue;
      }
      return value;
    }
    return null;
  };

  const caption = readCaption(contentRecord) ?? readCaption(attachmentsRecord);
  return {
    previewUrl,
    caption,
    alt: caption || 'Ảnh tin nhắn Zalo'
  };
}

function resolveFileRenderData(message: MessageRow): FileRenderData[] {
  const normalizedContentType = String(message.contentType ?? '').trim().toUpperCase();
  const contentRecord = parseRichMessageObject(message.content);
  const attachmentsRecord = toSafeRecord(message.attachmentsJson);
  const candidatesByUrl = new Map<string, FileRenderData & { score: number }>();

  const registerCandidate = (candidate: FileRenderData & { score: number }) => {
    if (!candidate.fileUrl || isLikelyImageUrl(candidate.fileUrl)) {
      return;
    }
    const previous = candidatesByUrl.get(candidate.fileUrl);
    if (!previous || candidate.score > previous.score) {
      candidatesByUrl.set(candidate.fileUrl, candidate);
    }
  };

  const collectFileCandidates = (value: unknown, keyHint: string, depth: number) => {
    if (depth > 6 || candidatesByUrl.size > 30) {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value.slice(0, 20)) {
        collectFileCandidates(item, keyHint, depth + 1);
      }
      return;
    }

    const record = toSafeRecord(value);
    if (!record) {
      if (typeof value === 'string') {
        const maybeUrl = value.trim();
        const keyScore = FILE_URL_HINT_KEYS.has(keyHint.toLowerCase()) ? 12 : 0;
        if (!/^https?:\/\//i.test(maybeUrl)) {
          return;
        }
        if (isLikelyFileUrl(maybeUrl)) {
          registerCandidate({
            fileUrl: maybeUrl,
            fileName: normalizeDownloadFileName(guessFileNameFromUrl(maybeUrl)) || 'Tệp đính kèm',
            description: null,
            fileSizeBytes: null,
            score: keyScore + 8
          });
        }
      }
      return;
    }

    let urlValue = '';
    let urlScore = 0;
    for (const [key, nestedValue] of Object.entries(record).slice(0, 40)) {
      if (typeof nestedValue !== 'string') {
        continue;
      }
      const normalizedKey = key.toLowerCase();
      const trimmedValue = nestedValue.trim();
      if (!/^https?:\/\//i.test(trimmedValue)) {
        continue;
      }
      const score = FILE_URL_HINT_KEYS.has(normalizedKey) ? 18 : 6;
      if (score > urlScore) {
        urlValue = trimmedValue;
        urlScore = score;
      }
    }

    if (urlValue) {
      const fileNameFromPayload = Object.entries(record)
        .filter(([key, nestedValue]) => FILE_NAME_HINT_KEYS.has(key) && typeof nestedValue === 'string')
        .map(([, nestedValue]) => String(nestedValue).trim())
        .find((nestedValue) => nestedValue.length > 0) || '';
      const guessedFileName = normalizeDownloadFileName(fileNameFromPayload)
        || normalizeDownloadFileName(guessFileNameFromUrl(urlValue))
        || 'Tệp đính kèm';

      const description = Object.entries(record)
        .filter(([key, nestedValue]) => FILE_DESCRIPTION_HINT_KEYS.has(key) && typeof nestedValue === 'string')
        .map(([, nestedValue]) => String(nestedValue).trim())
        .find((nestedValue) => nestedValue.length > 0 && nestedValue.length <= 240 && !/^https?:\/\//i.test(nestedValue))
        || null;

      const fileSizeBytes = Object.entries(record)
        .filter(([key]) => FILE_SIZE_HINT_KEYS.has(key))
        .map(([, nestedValue]) => toOptionalNumber(nestedValue))
        .find((nestedValue) => nestedValue !== null) ?? null;

      const keyHintScore = FILE_URL_HINT_KEYS.has(keyHint.toLowerCase()) ? 4 : 0;
      const typeScore = normalizedContentType === 'FILE' || normalizedContentType === 'RICH' ? 4 : 0;
      const fileNameScore = looksLikeFileName(guessedFileName) ? 10 : 0;
      const extensionScore = isLikelyFileUrl(urlValue) ? 10 : 0;
      if (extensionScore > 0 || fileNameScore > 0 || normalizedContentType === 'FILE') {
        registerCandidate({
          fileUrl: urlValue,
          fileName: guessedFileName,
          fileSizeBytes,
          description,
          score: urlScore + keyHintScore + typeScore + fileNameScore + extensionScore
        });
      }
    }

    for (const [key, nestedValue] of Object.entries(record).slice(0, 40)) {
      collectFileCandidates(nestedValue, key, depth + 1);
    }
  };

  collectFileCandidates(attachmentsRecord, '', 0);
  collectFileCandidates(contentRecord, '', 0);

  const rawContent = String(message.content ?? '').trim();
  if (/^https?:\/\//i.test(rawContent) && isLikelyFileUrl(rawContent)) {
    registerCandidate({
      fileUrl: rawContent,
      fileName: normalizeDownloadFileName(guessFileNameFromUrl(rawContent)) || 'Tệp đính kèm',
      fileSizeBytes: null,
      description: null,
      score: 8
    });
  }

  return [...candidatesByUrl.values()]
    .sort((left, right) => right.score - left.score)
    .map(({ score: _score, ...file }) => file);
}

export function ZaloAutomationMessagesWorkbench() {
  const { canModule, canAction } = useAccessPolicy();
  const canView = canModule('crm');
  const canCreate = canAction('crm', 'CREATE');
  const canUpdate = canAction('crm', 'UPDATE');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [zaloAccounts, setZaloAccounts] = useState<ZaloAccount[]>([]);
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [threadNextCursor, setThreadNextCursor] = useState<string | null>(null);
  const [hasMoreThreads, setHasMoreThreads] = useState(false);
  const [isLoadingMoreThreads, setIsLoadingMoreThreads] = useState(false);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [customer360, setCustomer360] = useState<Customer360Payload | null>(null);
  const [isLoadingCustomer360, setIsLoadingCustomer360] = useState(false);
  const [isCustomerProfilePanelOpen, setIsCustomerProfilePanelOpen] = useState(false);
  const [downloadingAttachmentKey, setDownloadingAttachmentKey] = useState<string | null>(null);
  const [needsSummaryDraft, setNeedsSummaryDraft] = useState('');
  const [isSavingNeedsSummary, setIsSavingNeedsSummary] = useState(false);
  const [linkCustomerPhoneInput, setLinkCustomerPhoneInput] = useState('');
  const [isLinkingCustomer, setIsLinkingCustomer] = useState(false);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [isQuickCreating, setIsQuickCreating] = useState(false);
  const [quickCreateForm, setQuickCreateForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    needsSummary: '',
    ownerStaffId: ''
  });
  const [isSavingInteraction, setIsSavingInteraction] = useState(false);
  const [interactionForm, setInteractionForm] = useState({
    interactionType: 'TU_VAN',
    channel: 'CHAT',
    content: '',
    resultTag: '',
    nextActionAt: ''
  });

  const [threadQuery, setThreadQuery] = useState('');
  const [threadTagQuery, setThreadTagQuery] = useState('');
  const [threadAccountId, setThreadAccountId] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState('');
  const [selectedThreadTagsInput, setSelectedThreadTagsInput] = useState('');
  const [sendMessageContent, setSendMessageContent] = useState('');
  const [isSavingThreadTags, setIsSavingThreadTags] = useState(false);
  const [togglingAutoReplyAccountId, setTogglingAutoReplyAccountId] = useState('');
  const isLoadingMoreThreadsRef = useRef(false);
  const markingReadThreadIdsRef = useRef(new Set<string>());

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [threads, selectedThreadId]
  );
  const selectedThreadMatchStatus = useMemo(
    () => toThreadMatchStatus(selectedThread?.matchStatus),
    [selectedThread?.matchStatus]
  );
  const resolvedCustomerId = useMemo(
    () => String(selectedThread?.customerId || selectedThread?.customer?.id || '').trim() || null,
    [selectedThread?.customer?.id, selectedThread?.customerId]
  );
  const selectedThreadTags = useMemo(
    () => (Array.isArray(selectedThread?.tags) ? selectedThread.tags.filter(Boolean) : []),
    [selectedThread]
  );
  const selectedThreadHasResolvedCustomer = useMemo(
    () => selectedThreadMatchStatus === 'matched' || Boolean(resolvedCustomerId),
    [resolvedCustomerId, selectedThreadMatchStatus]
  );
  const selectedThreadCustomerName = useMemo(
    () =>
      String(
        customer360?.customer?.fullName
        ?? selectedThread?.customer?.fullName
        ?? selectedThread?.customerDisplayName
        ?? ''
      ).trim(),
    [customer360?.customer?.fullName, selectedThread?.customer?.fullName, selectedThread?.customerDisplayName]
  );
  const selectedThreadCustomerPhone = useMemo(
    () =>
      String(
        customer360?.customer?.phone
        ?? selectedThread?.customer?.phone
        ?? selectedThread?.suggestedCustomer?.phone
        ?? ''
      ).trim(),
    [customer360?.customer?.phone, selectedThread?.customer?.phone, selectedThread?.suggestedCustomer?.phone]
  );

  useEffect(() => {
    setSelectedThreadTagsInput(selectedThreadTags.join(', '));
  }, [selectedThreadId, selectedThreadTags]);

  useEffect(() => {
    setIsCustomerProfilePanelOpen(false);
  }, [selectedThreadId]);

  useEffect(() => {
    if (selectedThread?.suggestedCustomer?.id) {
      setLinkCustomerPhoneInput(selectedThread.suggestedCustomer.phone || '');
      return;
    }
    setLinkCustomerPhoneInput('');
  }, [selectedThread?.id, selectedThread?.suggestedCustomer?.id, selectedThread?.suggestedCustomer?.phone]);

  useEffect(() => {
    setQuickCreateForm({
      fullName: selectedThread?.customerDisplayName || selectedThread?.customer?.fullName || '',
      phone: selectedThread?.suggestedCustomer?.phone || '',
      email: selectedThread?.suggestedCustomer?.email || '',
      needsSummary: '',
      ownerStaffId: selectedThread?.suggestedCustomer?.ownerStaffId || ''
    });
  }, [
    selectedThread?.id,
    selectedThread?.customerDisplayName,
    selectedThread?.customer?.fullName,
    selectedThread?.suggestedCustomer?.phone,
    selectedThread?.suggestedCustomer?.email,
    selectedThread?.suggestedCustomer?.ownerStaffId
  ]);

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
  const selectedThreadAccount = useMemo(() => {
    if (!selectedThread?.channelAccountId) {
      return null;
    }
    return zaloAccounts.find((account) => account.id === selectedThread.channelAccountId) ?? null;
  }, [selectedThread?.channelAccountId, zaloAccounts]);

  const canSendSelectedThread = useMemo(() => {
    if (!selectedThread || !canCreate) {
      return false;
    }
    if (!selectedThread.channelAccountId) {
      return true;
    }
    return selectedThreadPermission !== 'READ';
  }, [canCreate, selectedThread, selectedThreadPermission]);

  const canToggleSelectedThreadAutoReply = useMemo(() => {
    if (!selectedThread || !canUpdate) {
      return false;
    }
    if (selectedThread.channel !== 'ZALO_PERSONAL') {
      return false;
    }
    if (!selectedThread.channelAccountId) {
      return false;
    }
    return selectedThreadPermission !== 'READ';
  }, [canUpdate, selectedThread, selectedThreadPermission]);

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

  const loadThreads = async (options?: { append?: boolean; cursor?: string | null }) => {
    const append = options?.append === true;
    const cursor = append ? String(options?.cursor ?? threadNextCursor ?? '').trim() : '';

    if (append) {
      if (!cursor || !hasMoreThreads || isLoadingThreads || isLoadingMoreThreadsRef.current) {
        return;
      }
      isLoadingMoreThreadsRef.current = true;
      setIsLoadingMoreThreads(true);
    } else {
      setIsLoadingThreads(true);
    }

    try {
      const payload = await apiRequest<Record<string, unknown>>('/conversations/threads', {
        query: {
          q: threadQuery || undefined,
          tags: threadTagQuery || undefined,
          channel: 'ALL',
          channelAccountId: threadAccountId || undefined,
          cursor: cursor || undefined,
          limit: THREAD_PAGE_LIMIT
        }
      });
      const rows = (normalizeListPayload(payload) as ThreadRow[])
        .filter((row) => row.channel === 'ZALO_PERSONAL' || row.channel === 'ZALO_OA');
      const normalizedRows = rows.map((row) => ({
        ...row,
        matchStatus: toThreadMatchStatus(row.matchStatus),
        suggestedCustomer: row.suggestedCustomer ?? null,
        identityHint: row.identityHint ?? null
      }));

      const nextCursorValue =
        typeof payload.nextCursor === 'string'
          ? payload.nextCursor
          : payload.nextCursor === null
            ? null
            : null;

      setThreadNextCursor(nextCursorValue);
      setHasMoreThreads(Boolean(nextCursorValue));

      if (append) {
        setThreads((prev) => {
          if (prev.length === 0) {
            return normalizedRows;
          }
          const indexById = new Map(prev.map((thread, index) => [thread.id, index]));
          const nextRows = [...prev];
          for (const row of normalizedRows) {
            const foundIndex = indexById.get(row.id);
            if (foundIndex === undefined) {
              indexById.set(row.id, nextRows.length);
              nextRows.push(row);
              continue;
            }
            nextRows[foundIndex] = { ...nextRows[foundIndex], ...row };
          }
          return nextRows;
        });

        setSelectedThreadId((prev) => {
          if (prev) {
            return prev;
          }
          return normalizedRows[0]?.id ?? '';
        });
      } else {
        setThreads(normalizedRows);
        setSelectedThreadId((prev) => {
          if (prev && normalizedRows.some((thread) => thread.id === prev)) {
            return prev;
          }
          return normalizedRows[0]?.id ?? '';
        });
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được danh sách hội thoại.');
    } finally {
      if (append) {
        isLoadingMoreThreadsRef.current = false;
        setIsLoadingMoreThreads(false);
      } else {
        setIsLoadingThreads(false);
      }
    }
  };

  const onThreadListScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!hasMoreThreads || isLoadingThreads || isLoadingMoreThreads || !threadNextCursor) {
      return;
    }

    const container = event.currentTarget;
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceToBottom > THREAD_SCROLL_TRIGGER_PX) {
      return;
    }

    void loadThreads({
      append: true,
      cursor: threadNextCursor
    });
  };

  const loadMessages = async (threadId: string) => {
    setIsLoadingMessages(true);
    try {
      const payload = await apiRequest<{ items?: MessageRow[] }>(`/conversations/threads/${threadId}/messages`, {
        query: {
          limit: 100
        }
      });
      setMessages(normalizeListPayload(payload) as MessageRow[]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được tin nhắn hội thoại.');
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const loadCustomer360 = async (customerId: string) => {
    const id = String(customerId || '').trim();
    if (!id) {
      setCustomer360(null);
      setNeedsSummaryDraft('');
      return;
    }

    setIsLoadingCustomer360(true);
    try {
      const payload = await apiRequest<Customer360Payload>(`/crm/customers/${id}/customer-360`);
      const normalized = normalizeObjectPayload(payload) as Customer360Payload | null;
      setCustomer360(normalized ?? null);
      setNeedsSummaryDraft(String(normalized?.customer?.needsSummary ?? '').trim());
    } catch (error) {
      setCustomer360(null);
      setNeedsSummaryDraft('');
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được Customer 360.');
    } finally {
      setIsLoadingCustomer360(false);
    }
  };

  const upsertThreadState = (thread: ThreadRow) => {
    setThreads((prev) => {
      const found = prev.some((item) => item.id === thread.id);
      if (found) {
        return prev.map((item) => (item.id === thread.id ? { ...item, ...thread } : item));
      }
      return [thread, ...prev];
    });
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
  }, [canView, threadQuery, threadTagQuery, threadAccountId]);

  useEffect(() => {
    if (!canView || !selectedThreadId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedThreadId);
  }, [canView, selectedThreadId]);

  useEffect(() => {
    if (!canView || !selectedThread?.id) {
      return;
    }
    const unreadCount = Math.max(0, Number(selectedThread.unreadCount ?? 0) || 0);
    if (unreadCount <= 0) {
      return;
    }

    const threadId = selectedThread.id;
    if (markingReadThreadIdsRef.current.has(threadId)) {
      return;
    }

    markingReadThreadIdsRef.current.add(threadId);
    let disposed = false;
    void (async () => {
      try {
        await apiRequest(`/conversations/threads/${threadId}/mark-read`, {
          method: 'POST'
        });
        if (disposed) {
          return;
        }
        setThreads((prev) =>
          prev.map((thread) =>
            thread.id === threadId
              ? { ...thread, unreadCount: 0 }
              : thread
          )
        );
      } catch {
        // noop: avoid disrupting chat flow if mark-read fails transiently.
      } finally {
        markingReadThreadIdsRef.current.delete(threadId);
      }
    })();

    return () => {
      disposed = true;
    };
  }, [canView, selectedThread?.id, selectedThread?.unreadCount]);

  useEffect(() => {
    if (!canView || !selectedThread) {
      setCustomer360(null);
      setNeedsSummaryDraft('');
      return;
    }
    if (!resolvedCustomerId) {
      setCustomer360(null);
      setNeedsSummaryDraft('');
      return;
    }
    void loadCustomer360(resolvedCustomerId);
  }, [canView, selectedThread?.id, resolvedCustomerId]);

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

  const onSaveThreadTags = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearNotice();
    if (!selectedThread) {
      setErrorMessage('Vui lòng chọn hội thoại trước khi gắn tag.');
      return;
    }

    const nextTags = parseTagValues(selectedThreadTagsInput);
    setIsSavingThreadTags(true);
    try {
      const payload = await apiRequest<ThreadRow>(`/conversations/threads/${selectedThread.id}/tags`, {
        method: 'PATCH',
        body: {
          tags: nextTags
        }
      });
      const updatedThread = (normalizeObjectPayload(payload) as ThreadRow | null) ?? null;
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === selectedThread.id
            ? {
                ...thread,
                ...(updatedThread ?? {}),
                tags: Array.isArray(updatedThread?.tags) ? updatedThread.tags : nextTags
              }
            : thread
        )
      );
      setResultMessage('Đã cập nhật tag hội thoại.');
      await loadThreads();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể cập nhật tag hội thoại.');
    } finally {
      setIsSavingThreadTags(false);
    }
  };

  const onLinkCustomer = async (options?: { customerId?: string; customerPhone?: string }) => {
    clearNotice();
    if (!selectedThread) {
      setErrorMessage('Vui lòng chọn hội thoại trước khi gán khách hàng.');
      return;
    }
    const customerId = String(options?.customerId ?? '').trim();
    const customerPhone = String(options?.customerPhone ?? linkCustomerPhoneInput).trim();
    if (!customerId && !customerPhone) {
      setErrorMessage('Vui lòng nhập số điện thoại khách hàng cần gán.');
      return;
    }

    setIsLinkingCustomer(true);
    try {
      const payload = await apiRequest<ThreadRow>(`/conversations/threads/${selectedThread.id}/link-customer`, {
        method: 'POST',
        body: {
          customerId: customerId || undefined,
          customerPhone: customerPhone || undefined
        }
      });
      const linkedThread = (normalizeObjectPayload(payload) as ThreadRow | null) ?? null;
      if (linkedThread) {
        upsertThreadState({
          ...linkedThread,
          matchStatus: toThreadMatchStatus(linkedThread.matchStatus)
        });
      }
      setResultMessage('Đã gán hội thoại vào khách hàng thành công.');
      setIsQuickCreateOpen(false);
      const linkedCustomerId = String(linkedThread?.customerId ?? linkedThread?.customer?.id ?? '').trim();
      if (linkedCustomerId) {
        await Promise.all([loadThreads(), loadCustomer360(linkedCustomerId)]);
      } else {
        await loadThreads();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể gán khách hàng cho hội thoại.');
    } finally {
      setIsLinkingCustomer(false);
    }
  };

  const onQuickCreateCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearNotice();
    if (!selectedThread) {
      setErrorMessage('Vui lòng chọn hội thoại trước khi tạo khách hàng.');
      return;
    }

    setIsQuickCreating(true);
    try {
      const payload = await apiRequest<{
        customer?: CustomerPreview;
        thread?: ThreadRow;
        deduplicated?: boolean;
      }>(`/conversations/threads/${selectedThread.id}/quick-create-customer`, {
        method: 'POST',
        body: {
          fullName: quickCreateForm.fullName || undefined,
          phone: quickCreateForm.phone || undefined,
          email: quickCreateForm.email || undefined,
          needsSummary: quickCreateForm.needsSummary || undefined,
          ownerStaffId: quickCreateForm.ownerStaffId || undefined
        }
      });

      const thread = normalizeObjectPayload(payload.thread) as ThreadRow | null;
      const customer = normalizeObjectPayload(payload.customer) as CustomerPreview | null;

      if (thread) {
        upsertThreadState({
          ...thread,
          matchStatus: toThreadMatchStatus(thread.matchStatus)
        });
        setSelectedThreadId(thread.id);
      }
      if (customer?.id) {
        await loadCustomer360(customer.id);
      }

      setIsQuickCreateOpen(false);
      setResultMessage(payload.deduplicated
        ? 'Đã tìm thấy khách hàng sẵn có và liên kết hội thoại.'
        : 'Đã tạo khách hàng nhanh và liên kết hội thoại thành công.');
      await loadThreads();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tạo khách hàng nhanh.');
    } finally {
      setIsQuickCreating(false);
    }
  };

  const onSaveNeedsSummary = async () => {
    clearNotice();
    const customerId = resolvedCustomerId;
    if (!customerId) {
      setErrorMessage('Không tìm thấy khách hàng để cập nhật nhu cầu.');
      return;
    }

    setIsSavingNeedsSummary(true);
    try {
      await apiRequest(`/crm/customers/${customerId}`, {
        method: 'PATCH',
        body: {
          needsSummary: needsSummaryDraft || null
        }
      });
      setResultMessage('Đã cập nhật tóm tắt nhu cầu khách hàng.');
      await loadCustomer360(customerId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể cập nhật needsSummary.');
    } finally {
      setIsSavingNeedsSummary(false);
    }
  };

  const onLogInteraction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearNotice();
    const customerId = resolvedCustomerId;
    if (!customerId) {
      setErrorMessage('Không tìm thấy khách hàng để ghi nhận tương tác.');
      return;
    }
    if (!interactionForm.content.trim()) {
      setErrorMessage('Nội dung tương tác không được để trống.');
      return;
    }

    setIsSavingInteraction(true);
    try {
      await apiRequest('/crm/interactions', {
        method: 'POST',
        body: {
          customerId,
          interactionType: interactionForm.interactionType,
          channel: interactionForm.channel,
          content: interactionForm.content.trim(),
          resultTag: interactionForm.resultTag || undefined,
          nextActionAt: interactionForm.nextActionAt ? new Date(interactionForm.nextActionAt).toISOString() : undefined
        }
      });
      setInteractionForm((prev) => ({
        ...prev,
        content: '',
        resultTag: '',
        nextActionAt: ''
      }));
      setResultMessage('Đã ghi nhận lịch sử chăm sóc.');
      await loadCustomer360(customerId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể lưu lịch sử chăm sóc.');
    } finally {
      setIsSavingInteraction(false);
    }
  };

  const onOpenCustomerProfilePanel = async () => {
    clearNotice();
    const customerId = String(customer360?.customer?.id ?? resolvedCustomerId ?? '').trim();
    if (!customerId) {
      setErrorMessage('Không tìm thấy khách hàng để mở hồ sơ đầy đủ.');
      return;
    }
    setIsCustomerProfilePanelOpen(true);
    if (!customer360?.customer || customer360.customer.id !== customerId) {
      await loadCustomer360(customerId);
    }
  };

  const onDownloadAttachment = async (attachment: FileRenderData) => {
    const fileUrl = String(attachment.fileUrl ?? '').trim();
    if (!fileUrl) {
      setErrorMessage('Không tìm thấy liên kết file để tải.');
      return;
    }

    const fallbackFileName = normalizeDownloadFileName(attachment.fileName)
      || normalizeDownloadFileName(guessFileNameFromUrl(fileUrl))
      || 'zalo-attachment';
    const downloadKey = `${fileUrl}::${fallbackFileName}`;
    setDownloadingAttachmentKey(downloadKey);

    try {
      const response = await fetch(fileUrl, { method: 'GET' });
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fallbackFileName;
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(fileUrl, '_blank', 'noopener,noreferrer');
      setResultMessage('Đã mở file ở tab mới. Trình duyệt có thể chặn tải trực tiếp từ nguồn ngoài.');
    } finally {
      setDownloadingAttachmentKey((current) => (current === downloadKey ? null : current));
    }
  };

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

  const onToggleSelectedThreadAutoReply = async () => {
    clearNotice();
    const targetAccountId = String(selectedThread?.channelAccountId ?? '').trim();
    if (!targetAccountId || selectedThread?.channel !== 'ZALO_PERSONAL') {
      setErrorMessage('Chỉ hội thoại Zalo cá nhân mới hỗ trợ bật/tắt AI auto-reply.');
      return;
    }
    if (!canToggleSelectedThreadAutoReply) {
      setErrorMessage('Bạn không có quyền cập nhật trạng thái AI auto-reply cho hội thoại này.');
      return;
    }

    const currentAccount = zaloAccounts.find((account) => account.id === targetAccountId) ?? null;
    const nextEnabled = !Boolean(currentAccount?.aiAutoReplyEnabled);
    setTogglingAutoReplyAccountId(targetAccountId);
    try {
      await apiRequest(`/zalo/accounts/${targetAccountId}`, {
        method: 'PATCH',
        body: {
          aiAutoReplyEnabled: nextEnabled
        }
      });

      await Promise.all([loadAccounts(), loadThreads()]);

      setResultMessage(nextEnabled ? 'Đã bật AI auto-reply cho hội thoại này.' : 'Đã tắt AI auto-reply cho hội thoại này.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể cập nhật trạng thái AI auto-reply.');
    } finally {
      setTogglingAutoReplyAccountId('');
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
            <div className="field">
              <label htmlFor="zalo-msg-tag-filter">Tag</label>
              <input
                id="zalo-msg-tag-filter"
                value={threadTagQuery}
                onChange={(event) => setThreadTagQuery(event.target.value)}
                placeholder="VIP, tiềm năng, cần chăm sóc"
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
            <div
              className="zalo-chat-thread-list"
              onScroll={onThreadListScroll}
            >
              {threads.map((thread) => {
                const active = thread.id === selectedThreadId;
                const unreadCount = Math.max(0, Number(thread.unreadCount ?? 0) || 0);
                const threadMatch = toThreadMatchStatus(thread.matchStatus);
                const hasIdentifiedCustomer = threadMatch === 'matched' || Boolean(thread.customerId || thread.customer?.id);
                const threadDisplayName = String(
                  thread.customer?.fullName
                  || thread.customerDisplayName
                  || thread.externalThreadId
                  || 'Khách hàng'
                ).trim();
                const threadDisplayPhone = String(thread.customer?.phone || thread.suggestedCustomer?.phone || '').trim();
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
                        <div className="zalo-chat-thread-title-main">
                          <strong>{threadDisplayName}</strong>
                          {hasIdentifiedCustomer && threadDisplayPhone ? (
                            <span className="zalo-chat-thread-phone">{threadDisplayPhone}</span>
                          ) : null}
                        </div>
                      </div>
                      <span>{toDateTime(thread.lastMessageAt)}</span>
                    </div>
                    <div className="zalo-chat-thread-item-meta">
                      <span>{CHANNEL_LABELS[thread.channel] ?? thread.channel}</span>
                    </div>
                    <div className="zalo-chat-thread-item-meta">
                      <span>{thread.channelAccount?.displayName || thread.channelAccountId || '--'}</span>
                    </div>
                    <div className="zalo-chat-thread-item-meta">
                      <Badge variant={threadMatchBadge(threadMatch)}>
                        {threadMatchStatusLabel(threadMatch)}
                      </Badge>
                    </div>
                    {Array.isArray(thread.tags) && thread.tags.length > 0 ? (
                      <div className="zalo-chat-tag-list">
                        {thread.tags.map((tag) => (
                          <span key={`${thread.id}-${tag}`} className="zalo-chat-tag-chip">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {threads.length > 0 ? (
            <p className="muted" style={{ marginTop: '0.35rem' }}>
              {isLoadingMoreThreads
                ? 'Đang tải thêm hội thoại...'
                : hasMoreThreads
                  ? 'Cuộn xuống cuối danh sách để tải thêm hội thoại.'
                  : 'Đã hiển thị hết hội thoại phù hợp bộ lọc.'}
            </p>
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
            Hội thoại: {selectedThreadCustomerName || selectedThread?.externalThreadId || '--'}
          </p>
          {selectedThreadHasResolvedCustomer ? (
            <p className="muted">
              Khách hàng nhận diện: {selectedThreadCustomerName || '--'}
              {selectedThreadCustomerPhone ? ` • ${selectedThreadCustomerPhone}` : ''}
            </p>
          ) : null}
          <p className="muted">
            Tài khoản: {selectedThread?.channelAccount?.displayName || selectedThread?.channelAccountId || '--'}
          </p>
          {selectedThread?.channel === 'ZALO_PERSONAL' ? (
            <div
              className="action-buttons"
              style={{ marginTop: '0.3rem', marginBottom: '0.3rem', alignItems: 'center' }}
            >
              <Badge variant={selectedThreadAccount?.aiAutoReplyEnabled ? 'success' : 'neutral'}>
                AI auto-reply: {selectedThreadAccount?.aiAutoReplyEnabled ? 'ON' : 'OFF'}
              </Badge>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void onToggleSelectedThreadAutoReply()}
                disabled={!canToggleSelectedThreadAutoReply || togglingAutoReplyAccountId === selectedThread.channelAccountId}
              >
                {togglingAutoReplyAccountId === selectedThread.channelAccountId
                  ? 'Đang cập nhật...'
                  : (selectedThreadAccount?.aiAutoReplyEnabled ? 'Tắt AI auto-reply' : 'Bật AI auto-reply')}
              </button>
            </div>
          ) : null}
          <p className="muted">
            Tag hiện tại: {selectedThreadTags.length > 0 ? selectedThreadTags.map((tag) => `#${tag}`).join(', ') : '--'}
          </p>

          <form className="zalo-chat-tag-form" onSubmit={onSaveThreadTags}>
            <div className="field">
              <label htmlFor="zalo-thread-tags">Tag hội thoại</label>
              <input
                id="zalo-thread-tags"
                value={selectedThreadTagsInput}
                onChange={(event) => setSelectedThreadTagsInput(event.target.value)}
                placeholder="tag_1,tag_2"
                disabled={!selectedThread || isSavingThreadTags}
              />
            </div>
            <div className="action-buttons">
              <button
                type="submit"
                className="btn btn-secondary"
                disabled={!selectedThread || isSavingThreadTags}
              >
                {isSavingThreadTags ? 'Đang lưu...' : 'Lưu tag'}
              </button>
            </div>
          </form>

          {isLoadingMessages ? <p className="muted">Đang tải tin nhắn...</p> : null}
          {!isLoadingMessages && messages.length === 0 ? <p className="muted">Chưa có tin nhắn.</p> : null}

          {messages.length > 0 ? (
            <div className="zalo-chat-message-list">
              {[...messages].reverse().map((message) => {
                const outgoing = isOutgoingMessage(message);
                const senderLabel = String(message.senderName ?? '').trim() || message.senderType || '--';
                const stickerRender = resolveStickerRenderData(message);
                const imageRender = resolveImageRenderData(message);
                const fileRender = resolveFileRenderData(message);

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
                    <div className={`zalo-chat-message-content ${message.isDeleted ? 'muted' : ''}`}>
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
                      {!message.isDeleted && !stickerRender?.previewUrl && imageRender?.previewUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={imageRender.previewUrl}
                            alt={imageRender.alt}
                            className="zalo-chat-message-image"
                            loading="lazy"
                          />
                          {imageRender.caption ? (
                            <span className="zalo-chat-message-image-caption">{imageRender.caption}</span>
                          ) : null}
                        </>
                      ) : null}
                      {!message.isDeleted && !stickerRender?.previewUrl && !imageRender?.previewUrl && fileRender.length > 0 ? (
                        <div className="zalo-chat-message-file-list">
                          {fileRender.map((attachment) => {
                            const normalizedFileName = normalizeDownloadFileName(attachment.fileName) || 'Tệp đính kèm';
                            const fileSizeLabel = formatFileSize(attachment.fileSizeBytes);
                            const downloadKey = `${attachment.fileUrl}::${normalizedFileName}`;
                            return (
                              <article key={`${message.id}-${attachment.fileUrl}`} className="zalo-chat-message-file-card">
                                <div className="zalo-chat-message-file-meta">
                                  <strong className="zalo-chat-message-file-name">{normalizedFileName}</strong>
                                  <span className="zalo-chat-message-file-desc">
                                    {fileSizeLabel || 'Tệp đính kèm'}
                                    {attachment.description ? ` • ${attachment.description}` : ''}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm zalo-chat-message-file-download"
                                  onClick={() => void onDownloadAttachment({
                                    ...attachment,
                                    fileName: normalizedFileName
                                  })}
                                  disabled={downloadingAttachmentKey === downloadKey}
                                >
                                  {downloadingAttachmentKey === downloadKey ? 'Đang tải...' : 'Tải file'}
                                </button>
                              </article>
                            );
                          })}
                        </div>
                      ) : null}
                      {!message.isDeleted
                      && !stickerRender?.previewUrl
                      && !imageRender?.previewUrl
                      && fileRender.length === 0 ? (stickerRender?.fallbackText || message.content || '--') : null}
                    </div>
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

        <section className="panel-surface crm-panel zalo-chat-customer-panel">
          <div className="crm-panel-head">
            <h2>Customer 360</h2>
            <Badge variant={threadMatchBadge(selectedThreadMatchStatus)}>
              {threadMatchStatusLabel(selectedThreadMatchStatus)}
            </Badge>
          </div>

          {!selectedThread ? <p className="muted">Chọn một hội thoại để xem hồ sơ khách hàng.</p> : null}

          {selectedThread ? (
            <>
              <p className="muted">
                Thread ID: {selectedThread.externalThreadId}
              </p>
              <p className="muted">
                Social ID: {selectedThread.identityHint?.externalUserId || selectedThread.externalThreadId}
              </p>
            </>
          ) : null}

          {selectedThread && !resolvedCustomerId ? (
            <div className="zalo-c360-unmatched">
              <p className="muted">
                Chưa nhận diện khách hàng cho hội thoại này. Bạn có thể gán thủ công hoặc tạo nhanh hồ sơ mới.
              </p>

              {selectedThread.suggestedCustomer ? (
                <div className="zalo-c360-suggested">
                  <p>
                    Gợi ý: <strong>{selectedThread.suggestedCustomer.fullName}</strong>
                    {selectedThread.suggestedCustomer.phone ? ` • ${selectedThread.suggestedCustomer.phone}` : ''}
                  </p>
                  <div className="action-buttons">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={isLinkingCustomer}
                      onClick={() => void onLinkCustomer({
                        customerId: selectedThread.suggestedCustomer?.id,
                        customerPhone: selectedThread.suggestedCustomer?.phone || undefined
                      })}
                    >
                      {isLinkingCustomer ? 'Đang gán...' : 'Gán khách gợi ý'}
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="field">
                <label htmlFor="zalo-link-customer-phone">Gán thủ công theo số điện thoại</label>
                <input
                  id="zalo-link-customer-phone"
                  value={linkCustomerPhoneInput}
                  onChange={(event) => setLinkCustomerPhoneInput(event.target.value)}
                  placeholder="Nhập SĐT khách hàng, ví dụ 090..."
                />
              </div>
              <div className="action-buttons">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={isLinkingCustomer}
                  onClick={() => void onLinkCustomer({ customerPhone: linkCustomerPhoneInput })}
                >
                  {isLinkingCustomer ? 'Đang gán...' : 'Gán khách hàng'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setIsQuickCreateOpen(true)}
                >
                  Tạo khách nhanh
                </button>
              </div>
            </div>
          ) : null}

          {selectedThread && resolvedCustomerId && isLoadingCustomer360 ? (
            <p className="muted">Đang tải Customer 360...</p>
          ) : null}

          {selectedThread && resolvedCustomerId && !isLoadingCustomer360 && customer360?.customer ? (
            <div className="zalo-c360-content">
              <div className="zalo-c360-header-row">
                <div>
                  <strong>{customer360.customer.fullName}</strong>
                  <p className="muted">{customer360.customer.phone || '--'} • {customer360.customer.email || '--'}</p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void onOpenCustomerProfilePanel()}
                >
                  Mở hồ sơ đầy đủ
                </button>
              </div>

              <div className="zalo-c360-kpi-grid">
                <div className="zalo-c360-kpi-card">
                  <span>Đơn hàng</span>
                  <strong>{customer360.orderSummary?.totalOrders ?? customer360.customer.totalOrders ?? 0}</strong>
                </div>
                <div className="zalo-c360-kpi-card">
                  <span>Hợp đồng</span>
                  <strong>{customer360.contractSummary?.totalContracts ?? 0}</strong>
                </div>
                <div className="zalo-c360-kpi-card">
                  <span>Xe/Tài sản</span>
                  <strong>{customer360.vehicles?.length ?? 0}</strong>
                </div>
                <div className="zalo-c360-kpi-card">
                  <span>Lần liên hệ gần nhất</span>
                  <strong>{toDateTime(customer360.customer.lastContactAt)}</strong>
                </div>
              </div>

              <div className="field">
                <label htmlFor="zalo-c360-needs-summary">Tóm tắt nhu cầu</label>
                <textarea
                  id="zalo-c360-needs-summary"
                  value={needsSummaryDraft}
                  onChange={(event) => setNeedsSummaryDraft(event.target.value)}
                  placeholder="Mô tả nhu cầu hiện tại của khách hàng..."
                />
              </div>
              <div className="action-buttons">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={isSavingNeedsSummary}
                  onClick={() => void onSaveNeedsSummary()}
                >
                  {isSavingNeedsSummary ? 'Đang lưu...' : 'Lưu nhu cầu'}
                </button>
              </div>

              <form className="zalo-c360-interaction-form" onSubmit={onLogInteraction}>
                <h3>Log tương tác nhanh</h3>
                <div className="field">
                  <label htmlFor="zalo-c360-interaction-type">Loại tương tác</label>
                  <select
                    id="zalo-c360-interaction-type"
                    value={interactionForm.interactionType}
                    onChange={(event) => setInteractionForm((prev) => ({ ...prev, interactionType: event.target.value }))}
                  >
                    <option value="TU_VAN">Tư vấn</option>
                    <option value="CHAM_SOC">Chăm sóc</option>
                    <option value="NHAC_HAN">Nhắc hạn</option>
                    <option value="FOLLOW_UP">Follow-up</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="zalo-c360-interaction-channel">Kênh</label>
                  <select
                    id="zalo-c360-interaction-channel"
                    value={interactionForm.channel}
                    onChange={(event) => setInteractionForm((prev) => ({ ...prev, channel: event.target.value }))}
                  >
                    <option value="CHAT">CHAT</option>
                    <option value="CALL">CALL</option>
                    <option value="DIRECT">DIRECT</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="zalo-c360-interaction-content">Nội dung</label>
                  <textarea
                    id="zalo-c360-interaction-content"
                    value={interactionForm.content}
                    onChange={(event) => setInteractionForm((prev) => ({ ...prev, content: event.target.value }))}
                    placeholder="Nội dung trao đổi/chăm sóc khách hàng..."
                  />
                </div>
                <div className="field">
                  <label htmlFor="zalo-c360-interaction-result-tag">Kết quả (tag)</label>
                  <input
                    id="zalo-c360-interaction-result-tag"
                    value={interactionForm.resultTag}
                    onChange={(event) => setInteractionForm((prev) => ({ ...prev, resultTag: event.target.value }))}
                    placeholder="ví dụ: da_hen, can_goi_lai"
                  />
                </div>
                <div className="field">
                  <label htmlFor="zalo-c360-next-action-at">Lần hành động tiếp theo</label>
                  <input
                    id="zalo-c360-next-action-at"
                    type="datetime-local"
                    value={interactionForm.nextActionAt}
                    onChange={(event) => setInteractionForm((prev) => ({ ...prev, nextActionAt: event.target.value }))}
                  />
                </div>
                <div className="action-buttons">
                  <button type="submit" className="btn btn-primary" disabled={isSavingInteraction}>
                    {isSavingInteraction ? 'Đang lưu...' : 'Ghi nhận tương tác'}
                  </button>
                </div>
              </form>

              <div className="zalo-c360-history">
                <h3>Lịch sử chăm sóc gần đây</h3>
                {Array.isArray(customer360.recentInteractions) && customer360.recentInteractions.length > 0 ? (
                  <div className="zalo-c360-history-list">
                    {customer360.recentInteractions.slice(0, 8).map((interaction) => (
                      <article key={interaction.id} className="zalo-c360-history-item">
                        <header>
                          <strong>{interaction.interactionType || '--'} • {interaction.channel || '--'}</strong>
                          <span>{toDateTime(interaction.interactionAt)}</span>
                        </header>
                        <p>{interaction.content || '--'}</p>
                        <p className="muted">
                          Kết quả: {interaction.resultTag || '--'} • Next: {toDateTime(interaction.nextActionAt)}
                        </p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="muted">Chưa có lịch sử chăm sóc.</p>
                )}
              </div>
            </div>
          ) : null}
        </section>
      </section>

      <SidePanel
        isOpen={isCustomerProfilePanelOpen}
        onClose={() => setIsCustomerProfilePanelOpen(false)}
        title="Hồ sơ khách hàng"
      >
        {!resolvedCustomerId ? (
          <p className="muted">Chưa có khách hàng được nhận diện.</p>
        ) : null}
        {resolvedCustomerId && isLoadingCustomer360 && !customer360?.customer ? (
          <p className="muted">Đang tải hồ sơ khách hàng...</p>
        ) : null}
        {resolvedCustomerId && !isLoadingCustomer360 && !customer360?.customer ? (
          <p className="muted">Không tải được hồ sơ khách hàng.</p>
        ) : null}
        {resolvedCustomerId && customer360?.customer ? (
          <div className="zalo-customer-profile-panel">
            <section className="zalo-customer-profile-section">
              <h3>{customer360.customer.fullName || '--'}</h3>
              <p className="muted">
                {customer360.customer.phone || '--'} • {customer360.customer.email || '--'}
              </p>
              <p className="muted">Customer ID: {customer360.customer.id}</p>
            </section>

            <section className="zalo-customer-profile-section">
              <h4>Thông tin tổng quan</h4>
              <div className="zalo-customer-profile-grid">
                <div><span>Mã khách</span><strong>{customer360.customer.code || '--'}</strong></div>
                <div><span>Giai đoạn</span><strong>{customer360.customer.customerStage || '--'}</strong></div>
                <div><span>Nguồn</span><strong>{customer360.customer.source || '--'}</strong></div>
                <div><span>Nhóm</span><strong>{customer360.customer.segment || '--'}</strong></div>
                <div><span>Trạng thái</span><strong>{customer360.customer.status || '--'}</strong></div>
                <div><span>Owner</span><strong>{customer360.customer.ownerStaffId || '--'}</strong></div>
              </div>
              {Array.isArray(customer360.customer.tags) && customer360.customer.tags.length > 0 ? (
                <div className="zalo-chat-tag-list" style={{ marginTop: '0.5rem' }}>
                  {customer360.customer.tags.map((tag) => (
                    <span key={`profile-tag-${tag}`} className="zalo-chat-tag-chip">#{tag}</span>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="zalo-customer-profile-section">
              <h4>Tóm tắt nhu cầu</h4>
              <p>{customer360.customer.needsSummary || 'Chưa có tóm tắt nhu cầu.'}</p>
            </section>

            <section className="zalo-customer-profile-section">
              <h4>Hợp đồng gần đây</h4>
              {Array.isArray(customer360.recentContracts) && customer360.recentContracts.length > 0 ? (
                <div className="zalo-customer-profile-list">
                  {customer360.recentContracts.slice(0, 6).map((contract) => (
                    <article key={contract.id} className="zalo-customer-profile-list-item">
                      <header>
                        <strong>{contract.productType || 'CONTRACT'}</strong>
                        <span>{contract.status || '--'}</span>
                      </header>
                      <p className="muted">Hiệu lực: {toDateTime(contract.startsAt)} → {toDateTime(contract.endsAt)}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted">Chưa có hợp đồng.</p>
              )}
            </section>

            <section className="zalo-customer-profile-section">
              <h4>Xe/Tài sản</h4>
              {Array.isArray(customer360.vehicles) && customer360.vehicles.length > 0 ? (
                <div className="zalo-customer-profile-list">
                  {customer360.vehicles.slice(0, 8).map((vehicle) => (
                    <article key={vehicle.id} className="zalo-customer-profile-list-item">
                      <header>
                        <strong>{vehicle.plateNumber || '--'}</strong>
                        <span>{vehicle.status || '--'}</span>
                      </header>
                      <p className="muted">{vehicle.vehicleKind || '--'}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted">Chưa có dữ liệu xe/tài sản.</p>
              )}
            </section>

            <section className="zalo-customer-profile-section">
              <h4>Lịch sử chăm sóc</h4>
              {Array.isArray(customer360.recentInteractions) && customer360.recentInteractions.length > 0 ? (
                <div className="zalo-customer-profile-list">
                  {customer360.recentInteractions.slice(0, 8).map((interaction) => (
                    <article key={`profile-interaction-${interaction.id}`} className="zalo-customer-profile-list-item">
                      <header>
                        <strong>{interaction.interactionType || '--'} • {interaction.channel || '--'}</strong>
                        <span>{toDateTime(interaction.interactionAt)}</span>
                      </header>
                      <p>{interaction.content || '--'}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted">Chưa có lịch sử chăm sóc.</p>
              )}
            </section>
          </div>
        ) : null}
      </SidePanel>

      <Modal open={isQuickCreateOpen} onClose={() => setIsQuickCreateOpen(false)} title="Tạo khách hàng nhanh từ hội thoại">
        <form className="form-grid" onSubmit={onQuickCreateCustomer}>
          <p className="muted">
            Kênh: {selectedThread?.channel ? CHANNEL_LABELS[selectedThread.channel] : '--'} •
            Social ID: {selectedThread?.identityHint?.externalUserId || selectedThread?.externalThreadId || '--'}
          </p>
          <div className="field">
            <label htmlFor="quick-create-full-name">Họ tên</label>
            <input
              id="quick-create-full-name"
              value={quickCreateForm.fullName}
              onChange={(event) => setQuickCreateForm((prev) => ({ ...prev, fullName: event.target.value }))}
              placeholder="Nhập họ tên khách hàng"
            />
          </div>
          <div className="field">
            <label htmlFor="quick-create-phone">Điện thoại</label>
            <input
              id="quick-create-phone"
              value={quickCreateForm.phone}
              onChange={(event) => setQuickCreateForm((prev) => ({ ...prev, phone: event.target.value }))}
              placeholder="090..."
            />
          </div>
          <div className="field">
            <label htmlFor="quick-create-email">Email</label>
            <input
              id="quick-create-email"
              value={quickCreateForm.email}
              onChange={(event) => setQuickCreateForm((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="khach@example.com"
            />
          </div>
          <div className="field">
            <label htmlFor="quick-create-owner">Owner staff ID</label>
            <input
              id="quick-create-owner"
              value={quickCreateForm.ownerStaffId}
              onChange={(event) => setQuickCreateForm((prev) => ({ ...prev, ownerStaffId: event.target.value }))}
              placeholder="Nhập mã nhân sự phụ trách (nếu có)"
            />
          </div>
          <div className="field">
            <label htmlFor="quick-create-needs-summary">Tóm tắt nhu cầu</label>
            <textarea
              id="quick-create-needs-summary"
              value={quickCreateForm.needsSummary}
              onChange={(event) => setQuickCreateForm((prev) => ({ ...prev, needsSummary: event.target.value }))}
              placeholder="Nhu cầu chính của khách..."
            />
          </div>
          <div className="action-buttons">
            <button type="button" className="btn btn-ghost" onClick={() => setIsQuickCreateOpen(false)}>
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={isQuickCreating}>
              {isQuickCreating ? 'Đang tạo...' : 'Tạo & liên kết'}
            </button>
          </div>
        </form>
      </Modal>
    </article>
  );
}
