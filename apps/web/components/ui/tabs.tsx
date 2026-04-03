'use client';

import { type ReactNode, useState } from 'react';

type Tab = {
  key: string;
  label: string;
  icon?: ReactNode;
};

type TabsProps = {
  tabs: Tab[];
  defaultTab?: string;
  activeTab?: string;
  onTabChange?: (key: string) => void;
  children?: (activeKey: string) => ReactNode;
  className?: string;
};

export function Tabs({ tabs, defaultTab, activeTab, onTabChange, children, className }: TabsProps) {
  const [internalActive, setInternalActive] = useState(defaultTab || tabs[0]?.key || '');
  const current = activeTab ?? internalActive;

  const handleClick = (key: string) => {
    if (!activeTab) setInternalActive(key);
    onTabChange?.(key);
  };

  return (
    <div className={className}>
      <div className="tabs-bar" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={current === tab.key}
            className={`tab-item${current === tab.key ? ' tab-active' : ''}`}
            onClick={() => handleClick(tab.key)}
          >
            {tab.icon && <span className="tab-icon">{tab.icon}</span>}
            {tab.label}
          </button>
        ))}
      </div>
      {children && (
        <div className="tab-content" role="tabpanel">
          {children(current)}
        </div>
      )}
    </div>
  );
}
