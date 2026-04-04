'use client';

type DomainStateLite<TDomain extends string> = {
  domain: TDomain;
  ok: boolean;
  runtimeApplied?: boolean;
};

type DomainGroup<TDomain extends string> = {
  id: string;
  label: string;
  domains: readonly TDomain[];
};

type GroupedSidebarProps<TDomain extends string> = {
  groups: readonly DomainGroup<TDomain>[];
  labels: Record<TDomain, string>;
  selectedDomain: TDomain;
  onSelectDomain: (domain: TDomain) => void;
  domainStates?: DomainStateLite<TDomain>[];
};

function getDomainState<TDomain extends string>(
  states: DomainStateLite<TDomain>[] | undefined,
  domain: TDomain
) {
  return states?.find((item) => item.domain === domain);
}

export function GroupedSidebar<TDomain extends string>({
  groups,
  labels,
  selectedDomain,
  onSelectDomain,
  domainStates
}: GroupedSidebarProps<TDomain>) {
  return (
    <aside className="settings-sidebar-panel">
      <h3 className="settings-sidebar-title">Miền cấu hình</h3>
      <div className="settings-sidebar-groups">
        {groups.map((group) => (
          <section key={group.id} className="settings-sidebar-group">
            <p className="settings-sidebar-group-label">
              {group.label}
            </p>
            <div className="settings-sidebar-domain-list">
              {group.domains.map((domain) => {
                const state = getDomainState(domainStates, domain);
                return (
                  <button
                    key={domain}
                    type="button"
                    onClick={() => onSelectDomain(domain)}
                    className={`btn btn-ghost settings-sidebar-domain-btn${selectedDomain === domain ? ' settings-sidebar-domain-btn-active' : ''}`}
                  >
                    <span className="settings-sidebar-domain-label">{labels[domain]}</span>
                    <span className="settings-sidebar-domain-meta">
                      <span className={`settings-sidebar-state ${state?.ok ? 'is-ok' : 'is-warn'}`}>
                        {state?.ok ? 'ỔN' : 'CẢNH BÁO'}
                      </span>
                      <span className={`settings-sidebar-runtime ${state?.runtimeApplied ? 'is-ok' : 'is-warn'}`}>
                        {state?.runtimeApplied ? 'ĐANG DÙNG' : 'CHỜ ÁP DỤNG'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
