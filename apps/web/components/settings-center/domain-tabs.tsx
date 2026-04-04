'use client';

import { Tabs } from '../ui/tabs';
import type { DomainTabConfig } from './view-model';

type DomainTabsProps = {
  tabs: DomainTabConfig[];
  activeTab: string;
  onChange: (tabKey: string) => void;
};

export function DomainTabs({ tabs, activeTab, onChange }: DomainTabsProps) {
  if (tabs.length <= 1) {
    return null;
  }

  return (
    <Tabs
      tabs={tabs.map((tab) => ({ key: tab.key, label: tab.label }))}
      activeTab={activeTab}
      onTabChange={onChange}
      className="settings-domain-tabs"
    />
  );
}
