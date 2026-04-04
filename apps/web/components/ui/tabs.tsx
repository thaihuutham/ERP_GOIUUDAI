'use client';

import { type KeyboardEvent, type ReactNode, useState } from 'react';

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

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tabKey: string) => {
    if (tabs.length <= 1) {
      return;
    }

    const currentIndex = tabs.findIndex((tab) => tab.key === tabKey);
    if (currentIndex < 0) {
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      const next = tabs[(currentIndex + 1) % tabs.length];
      if (next) {
        handleClick(next.key);
      }
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const next = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
      if (next) {
        handleClick(next.key);
      }
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      const first = tabs[0];
      if (first) {
        handleClick(first.key);
      }
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      const last = tabs[tabs.length - 1];
      if (last) {
        handleClick(last.key);
      }
    }
  };

  return (
    <div className={className}>
      <div className="tabs-bar" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={current === tab.key}
            tabIndex={current === tab.key ? 0 : -1}
            className={`tab-item${current === tab.key ? ' tab-active' : ''}`}
            onClick={() => handleClick(tab.key)}
            onKeyDown={(event) => handleKeyDown(event, tab.key)}
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
