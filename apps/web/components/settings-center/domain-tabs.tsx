'use client';

import { Tabs } from '../ui/tabs';
import type { DomainTabConfig } from './view-model';

type DomainTabsProps = {
  tabs: DomainTabConfig[];
  activeTab: string;
  onChange: (tabKey: string) => void;
  className?: string;
};

export function DomainTabs({ tabs, activeTab, onChange, className }: DomainTabsProps) {
  if (tabs.length <= 1) {
    return null;
  }

  const classes = className ? `settings-domain-tabs ${className}` : 'settings-domain-tabs';

  return (
    <Tabs
      tabs={tabs.map((tab) => ({ key: tab.key, label: tab.label }))}
      activeTab={activeTab}
      onTabChange={onChange}
      className={classes}
    />
  );
}
