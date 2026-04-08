import { Prisma } from '@prisma/client';

export type ZaloAutoReplyThreadState = {
  pauseUntil: string | null;
  pendingCustomerMessageId: string | null;
  pendingCustomerSentAt: string | null;
  pendingDueAt: string | null;
  lastHandledCustomerMessageId: string | null;
  lastAiReplyAt: string | null;
};

const AUTO_REPLY_METADATA_KEY = 'zaloAutoReply';

export function readZaloAutoReplyThreadState(metadataJson: unknown): ZaloAutoReplyThreadState {
  const root = ensureRecord(metadataJson);
  const rawState = ensureRecord(root[AUTO_REPLY_METADATA_KEY]);

  return {
    pauseUntil: readOptionalString(rawState.pauseUntil),
    pendingCustomerMessageId: readOptionalString(rawState.pendingCustomerMessageId),
    pendingCustomerSentAt: readOptionalString(rawState.pendingCustomerSentAt),
    pendingDueAt: readOptionalString(rawState.pendingDueAt),
    lastHandledCustomerMessageId: readOptionalString(rawState.lastHandledCustomerMessageId),
    lastAiReplyAt: readOptionalString(rawState.lastAiReplyAt)
  };
}

export function patchZaloAutoReplyThreadState(
  metadataJson: unknown,
  patch: Partial<ZaloAutoReplyThreadState> & { clearPending?: boolean }
): Prisma.InputJsonValue {
  const root = ensureRecord(metadataJson);
  const currentState = ensureRecord(root[AUTO_REPLY_METADATA_KEY]);

  const nextState: Record<string, unknown> = {
    ...currentState
  };

  if (patch.clearPending) {
    nextState.pendingCustomerMessageId = null;
    nextState.pendingCustomerSentAt = null;
    nextState.pendingDueAt = null;
  }

  if (patch.pauseUntil !== undefined) {
    nextState.pauseUntil = patch.pauseUntil;
  }

  if (patch.pendingCustomerMessageId !== undefined) {
    nextState.pendingCustomerMessageId = patch.pendingCustomerMessageId;
  }

  if (patch.pendingCustomerSentAt !== undefined) {
    nextState.pendingCustomerSentAt = patch.pendingCustomerSentAt;
  }

  if (patch.pendingDueAt !== undefined) {
    nextState.pendingDueAt = patch.pendingDueAt;
  }

  if (patch.lastHandledCustomerMessageId !== undefined) {
    nextState.lastHandledCustomerMessageId = patch.lastHandledCustomerMessageId;
  }

  if (patch.lastAiReplyAt !== undefined) {
    nextState.lastAiReplyAt = patch.lastAiReplyAt;
  }

  root[AUTO_REPLY_METADATA_KEY] = nextState;
  return root as Prisma.InputJsonValue;
}

function ensureRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return { ...(value as Record<string, unknown>) };
}

function readOptionalString(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}
