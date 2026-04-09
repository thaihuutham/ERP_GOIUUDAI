import type { UserRole } from './rbac';

export const ASSISTANT_ROUTE_ORDER = ['runs', 'access', 'proxy', 'knowledge', 'channels'] as const;
export type AssistantRouteKey = (typeof ASSISTANT_ROUTE_ORDER)[number];

export type AssistantRouteDefinition = {
  key: AssistantRouteKey;
  title: string;
  href: `/modules/assistant/${AssistantRouteKey}`;
};

export const ASSISTANT_ROUTE_DEFINITIONS: AssistantRouteDefinition[] = [
  { key: 'runs', title: 'Phiên chạy AI', href: '/modules/assistant/runs' },
  { key: 'access', title: 'Phạm vi truy cập', href: '/modules/assistant/access' },
  { key: 'proxy', title: 'Proxy dữ liệu', href: '/modules/assistant/proxy' },
  { key: 'knowledge', title: 'Kho tri thức', href: '/modules/assistant/knowledge' },
  { key: 'channels', title: 'Kênh phân phối', href: '/modules/assistant/channels' }
];

export function canAccessAssistantRoute(role: UserRole, routeKey: AssistantRouteKey) {
  void role;
  void routeKey;
  return true;
}

export function getAllowedAssistantRoutes(role: UserRole) {
  return ASSISTANT_ROUTE_DEFINITIONS.filter((item) => canAccessAssistantRoute(role, item.key));
}

export function resolveAssistantRouteFromPath(pathname: string): AssistantRouteKey | null {
  const match = pathname.match(/^\/modules\/assistant\/([^/?#]+)/i);
  if (!match) {
    return null;
  }
  const key = String(match[1] ?? '').toLowerCase();
  return ASSISTANT_ROUTE_ORDER.find((item) => item === key) ?? null;
}
