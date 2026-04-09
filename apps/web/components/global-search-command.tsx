'use client';

import { type ComponentType, type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  FileText,
  FolderKanban,
  GitBranch,
  Package,
  Search,
  ShoppingCart,
  Truck,
  UserCheck,
  Users
} from 'lucide-react';
import { apiRequest } from '../lib/api-client';
import { Modal } from './ui/modal';

type SearchResultItem = {
  id: string;
  title: string;
  snippet: string;
  status?: string | null;
  meta?: string | null;
  target: string;
};

type SearchResultGroup = {
  entity: string;
  label: string;
  icon: string;
  count: number;
  items: SearchResultItem[];
};

type GlobalSearchResponse = {
  query: string;
  total: number;
  limitPerGroup: number;
  groups: SearchResultGroup[];
  generatedAt: string;
};

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

const ICON_MAP: Record<string, ComponentType<{ size?: number }>> = {
  users: Users,
  'shopping-cart': ShoppingCart,
  'file-text': FileText,
  package: Package,
  'user-check': UserCheck,
  'folder-kanban': FolderKanban,
  truck: Truck,
  'git-branch': GitBranch,
  'bar-chart-3': BarChart3
};

type FlatSearchItem = {
  groupLabel: string;
  item: SearchResultItem;
};

export function GlobalSearchCommand() {
  const router = useRouter();
  const [inlineQuery, setInlineQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GlobalSearchResponse | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const flatItems = useMemo<FlatSearchItem[]>(
    () =>
      (result?.groups ?? []).flatMap((group) =>
        group.items.map((item) => ({
          groupLabel: group.label,
          item
        }))
      ),
    [result?.groups]
  );

  const openCommand = useCallback(
    (seedQuery?: string) => {
      const normalized = String(seedQuery ?? inlineQuery ?? '').trim();
      setQuery(normalized);
      setOpen(true);
      setActiveIndex(0);
    },
    [inlineQuery]
  );

  const closeCommand = useCallback(() => {
    setOpen(false);
    setError(null);
    setBusy(false);
  }, []);

  const goToResult = useCallback(
    (target: string) => {
      closeCommand();
      router.push(target);
    },
    [closeCommand, router]
  );

  useEffect(() => {
    const onHotKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') {
        return;
      }
      event.preventDefault();
      openCommand();
    };

    window.addEventListener('keydown', onHotKey);
    return () => window.removeEventListener('keydown', onHotKey);
  }, [openCommand]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const keyword = query.trim();
    if (keyword.length < MIN_QUERY_LENGTH) {
      setBusy(false);
      setError(null);
      setResult(null);
      return;
    }

    let active = true;
    setBusy(true);
    setError(null);

    const timer = setTimeout(() => {
      void apiRequest<GlobalSearchResponse>('/search/global', {
        query: {
          q: keyword,
          limit: 6
        }
      })
        .then((payload) => {
          if (!active) return;
          setResult(payload);
          setActiveIndex(0);
        })
        .catch((reason) => {
          if (!active) return;
          setResult(null);
          setError(reason instanceof Error ? reason.message : 'Không thể tìm kiếm toàn hệ thống.');
        })
        .finally(() => {
          if (!active) return;
          setBusy(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, query]);

  const onInlineSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    openCommand(inlineQuery);
  };

  const onCommandSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (flatItems.length === 0) {
      return;
    }
    const selected = flatItems[activeIndex]?.item;
    if (!selected) {
      return;
    }
    goToResult(selected.target);
  };

  return (
    <>
      <form className="global-search-form" onSubmit={onInlineSubmit}>
        <Search size={14} />
        <input
          type="search"
          value={inlineQuery}
          onChange={(event) => setInlineQuery(event.target.value)}
          className="global-search-input"
          placeholder="Tìm toàn hệ thống..."
          aria-label="Tìm kiếm toàn hệ thống"
        />
        <button
          type="button"
          className="global-search-shortcut"
          onClick={() => openCommand()}
          aria-label="Mở tìm kiếm nhanh"
        >
          ⌘K
        </button>
      </form>

      <Modal
        open={open}
        onClose={closeCommand}
        title="Tìm kiếm toàn hệ thống"
        maxWidth="920px"
      >
        <form className="global-search-command" onSubmit={onCommandSubmit}>
          <div className="global-search-command-input-wrap">
            <Search size={16} />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (flatItems.length === 0) {
                  return;
                }
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setActiveIndex((prev) => (prev + 1) % flatItems.length);
                  return;
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActiveIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length);
                  return;
                }
              }}
              placeholder="Nhập khách hàng, đơn hàng, PO, báo cáo..."
              aria-label="Tìm kiếm toàn hệ thống"
            />
          </div>

          {query.trim().length < MIN_QUERY_LENGTH && (
            <p className="global-search-command-hint">
              Nhập ít nhất {MIN_QUERY_LENGTH} ký tự để tìm trong toàn bộ ERP (khách hàng, đơn hàng, hóa đơn, sản phẩm, nhân sự, dự án, mua hàng, workflow, báo cáo).
            </p>
          )}

          {busy && <p className="global-search-command-hint">Đang tìm kiếm...</p>}
          {error && <p className="global-search-command-error">{error}</p>}

          {!busy && !error && result && result.groups.length === 0 && (
            <p className="global-search-command-hint">
              Không tìm thấy dữ liệu phù hợp. Bạn có thể thử từ khóa ngắn hơn hoặc theo mã chứng từ.
            </p>
          )}

          {!busy && !error && result && result.groups.length > 0 && (
            <div className="global-search-groups">
              {result.groups.map((group) => {
                const GroupIcon = ICON_MAP[group.icon] ?? Search;
                return (
                  <section key={group.entity} className="global-search-group">
                    <div className="global-search-group-header">
                      <span>
                        <GroupIcon size={14} /> {group.label}
                      </span>
                      <strong>{group.count}</strong>
                    </div>
                    <div className="global-search-group-items">
                      {group.items.map((item) => {
                        const index = flatItems.findIndex((flat) => flat.item.id === item.id);
                        const isActive = index === activeIndex;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={`global-search-result-item${isActive ? ' is-active' : ''}`}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => goToResult(item.target)}
                          >
                            <span className="global-search-result-title">{item.title}</span>
                            {item.snippet ? <span className="global-search-result-snippet">{item.snippet}</span> : null}
                            <span className="global-search-result-meta">
                              {item.status ? <em>{item.status}</em> : null}
                              {item.meta ? <small>{item.meta}</small> : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </form>
      </Modal>
    </>
  );
}
