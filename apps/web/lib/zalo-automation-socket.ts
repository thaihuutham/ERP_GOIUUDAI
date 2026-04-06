'use client';

import { io, type Socket } from 'socket.io-client';

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');
const SOCKET_NAMESPACE = '/zalo-automation';

let cachedSocket: Socket | null = null;

function resolveSocketBaseUrl() {
  const withoutApiPrefix = API_BASE_URL.replace(/\/api\/v1$/i, '');
  try {
    return new URL(withoutApiPrefix).origin;
  } catch {
    return 'http://localhost:3001';
  }
}

export function resolveZaloAutomationOrgId() {
  return String(process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID ?? 'GOIUUDAI').trim() || 'GOIUUDAI';
}

export function getZaloAutomationSocket() {
  if (typeof window === 'undefined') {
    return null;
  }

  if (cachedSocket) {
    return cachedSocket;
  }

  const baseUrl = resolveSocketBaseUrl();
  cachedSocket = io(`${baseUrl}${SOCKET_NAMESPACE}`, {
    transports: ['websocket', 'polling'],
    withCredentials: true
  });

  return cachedSocket;
}

export function disconnectZaloAutomationSocket() {
  if (!cachedSocket) {
    return;
  }
  cachedSocket.disconnect();
  cachedSocket = null;
}
