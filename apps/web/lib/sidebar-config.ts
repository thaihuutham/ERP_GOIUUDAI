export type SidebarAccentToken =
  | '--accent-business'
  | '--accent-hr'
  | '--accent-finance'
  | '--accent-system';

export type SidebarNavItemConfig =
  | {
      type: 'dashboard';
      key: 'dashboard';
      title: string;
      href: '/';
      iconKey: 'dashboard';
    }
  | {
      type: 'module';
      key: string;
      moduleKey: string;
    }
  | {
      type: 'custom';
      key: string;
      title: string;
      href: string;
      iconKey: string;
      requiresFlag?: 'zaloAutomation';
    };

export type SidebarGroupConfig = {
  key: string;
  title: string | null;
  accentToken?: SidebarAccentToken;
  items: SidebarNavItemConfig[];
};

export const SIDEBAR_GROUPS: SidebarGroupConfig[] = [
  {
    key: 'overview',
    title: null,
    items: [
      {
        type: 'dashboard',
        key: 'dashboard',
        title: 'Tổng quan',
        href: '/',
        iconKey: 'dashboard',
      },
    ],
  },
  {
    key: 'business',
    title: 'KINH DOANH',
    accentToken: '--accent-business',
    items: [
      { type: 'module', key: 'crm', moduleKey: 'crm' },
      { type: 'module', key: 'sales', moduleKey: 'sales' },
      { type: 'module', key: 'catalog', moduleKey: 'catalog' }
    ],
  },
  {
    key: 'zalo-automation',
    title: 'ZALO AUTOMATION',
    accentToken: '--accent-business',
    items: [
      {
        type: 'custom',
        key: 'zalo-messages',
        title: 'Tin nhắn',
        href: '/modules/zalo-automation/messages',
        iconKey: 'conversations',
        requiresFlag: 'zaloAutomation'
      },
      {
        type: 'custom',
        key: 'zalo-accounts',
        title: 'Tài khoản Zalo',
        href: '/modules/zalo-automation/accounts',
        iconKey: 'zaloAccounts',
        requiresFlag: 'zaloAutomation'
      },
      {
        type: 'custom',
        key: 'zalo-ai-runs',
        title: 'AI đánh giá & Phiên chạy',
        href: '/modules/zalo-automation/ai-runs',
        iconKey: 'assistant',
        requiresFlag: 'zaloAutomation'
      },
      {
        type: 'custom',
        key: 'zalo-campaigns',
        title: 'Chiến dịch',
        href: '/modules/zalo-automation/campaigns',
        iconKey: 'workflows',
        requiresFlag: 'zaloAutomation'
      }
    ]
  },
  {
    key: 'hr',
    title: 'NHÂN SỰ',
    accentToken: '--accent-hr',
    items: [{ type: 'module', key: 'hr', moduleKey: 'hr' }],
  },
  {
    key: 'finance',
    title: 'TÀI CHÍNH & VẬN HÀNH',
    accentToken: '--accent-finance',
    items: [
      { type: 'module', key: 'finance', moduleKey: 'finance' },
      { type: 'module', key: 'scm', moduleKey: 'scm' },
      { type: 'module', key: 'assets', moduleKey: 'assets' },
      { type: 'module', key: 'projects', moduleKey: 'projects' },
    ],
  },
  {
    key: 'system',
    title: 'HỆ THỐNG',
    accentToken: '--accent-system',
    items: [
      { type: 'module', key: 'workflows', moduleKey: 'workflows' },
      { type: 'module', key: 'assistant', moduleKey: 'assistant' },
      { type: 'module', key: 'reports', moduleKey: 'reports' },
      { type: 'module', key: 'audit', moduleKey: 'audit' },
      { type: 'module', key: 'notifications', moduleKey: 'notifications' },
      { type: 'module', key: 'settings', moduleKey: 'settings' },
    ],
  },
];
