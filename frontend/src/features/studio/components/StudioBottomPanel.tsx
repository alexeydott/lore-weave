// Bottom panel (toggle) — the VS Code "panel" analogue: Jobs / Issues.
// S-10 O3: Issues is a real ranked problems feed (StudioIssuesFeed). Jobs renders
// JobsCompactFeed — a purpose-built compact projection of the same data spine the
// jobs-list dock panel uses (the full dashboard was unreadable at panel height,
// #user-report 2026-11-28). The panel is height-resizable via the sash on its top
// edge (persisted per-book/device, VS Code panel behaviour), with a full-dashboard
// escape hatch in the feed header.
// The old stub tabs (two identical pointer buttons to the same dock panel, one
// labelled "Generation" with no distinct content anywhere) were removed as atavism:
// the bottom panel must hold CONTENT, not launchers.
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Plus, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { JobsStreamProvider } from '@/features/jobs/context/JobsStreamProvider';
import { JobsCompactFeed } from '@/features/jobs/components/JobsCompactFeed';
import { NotificationsCompactFeed } from '@/features/notifications/components/NotificationsCompactFeed';
import { notificationLink } from '@/features/notifications/link';
import { followStudioLink } from '../host/studioLinks';
import { OPENABLE_STUDIO_PANELS, type StudioPanelDef } from '../panels/catalog';
import type { IDockviewPanelProps } from 'dockview-react';
import { useStudioHost } from '../host/StudioHostProvider';
import { StudioIssuesFeed } from './StudioIssuesFeed';

type BottomTab = 'jobs' | 'notifications' | 'issues';
const TABS: BottomTab[] = ['jobs', 'notifications', 'issues'];

export function StudioBottomPanel({
  onClose,
  height,
  onResize,
  pinnedPanels = [],
  onPinPanel = () => {},
  onUnpinPanel = () => {},
}: {
  onClose: () => void;
  height: number;
  /** (px, persist) — live during the drag, persisted on pointer-up (sidebar-sash contract). */
  onResize: (height: number, persist?: boolean) => void;
  /** Catalog panel ids pinned as extra bottom tabs (chrome.bottomTabs). */
  pinnedPanels?: string[];
  onPinPanel?: (panelId: string) => void;
  onUnpinPanel?: (panelId: string) => void;
}) {
  const { t } = useTranslation('studio');
  const host = useStudioHost();
  const { openPanel } = host;
  const [tab, setTab] = useState<string>('jobs');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const drag = useRef<{ startY: number; startHeight: number } | null>(null);

  // The pinned-catalog tab list + the picker contents (exclude built-ins and already pinned).
  const pinnedDefs = useMemo(
    () => pinnedPanels
      .map((id) => OPENABLE_STUDIO_PANELS.find((p) => p.id === id))
      .filter((d): d is StudioPanelDef => Boolean(d)),
    [pinnedPanels],
  );
  const pickerList = useMemo(() => {
    const q = query.trim().toLowerCase();
    return OPENABLE_STUDIO_PANELS
      .filter((p) => !pinnedPanels.includes(p.id))
      .filter((p) => {
        const label = t(p.titleKey, { defaultValue: p.id });
        return !q || (label + ' ' + p.id).toLowerCase().includes(q);
      });
  }, [pinnedPanels, query, t]);

  // Outside dockview the catalog panels still expect a dock panel api. The only
  // members any panel actually touches: setTitle (useStudioPanel), the
  // optional-chained onDidParametersChange / updateParameters / close. A small
  // stub keeps them honest — close() unpins the tab, parameters are static {}.
  const makeStubApi = useCallback((panelId: string): IDockviewPanelProps['api'] => {
    const stub = {
      id: panelId,
      setTitle: () => { /* the tab label is the catalog title already */ },
      close: () => onUnpinPanel(panelId),
      updateParameters: () => { /* static placement — no dock params here */ },
      onDidParametersChange: () => ({ dispose: () => {} }),
    };
    return new Proxy(stub, {
      get(target, prop) {
        if (prop in target) return target[prop as keyof typeof target];
        // every other api member is a silent noop (panels must not depend on it
        // for correctness — the dock remains the source of truth for lifecycle).
        return () => ({ dispose: () => {} });
      },
    }) as unknown as IDockviewPanelProps['api'];
  }, [onUnpinPanel]);

  // Vertical sash: dragging UP grows the panel. Live updates (persist=false) on every
  // pointer-move, one localStorage write on pointer-up, double-click resets (VS Code).
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      drag.current = { startY: e.clientY, startHeight: height };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [height],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!drag.current) return;
      onResize(drag.current.startHeight + (drag.current.startY - e.clientY), false);
    },
    [onResize],
  );
  const finishDrag = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!drag.current) return;
      onResize(drag.current.startHeight + (drag.current.startY - e.clientY), true);
      drag.current = null;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    },
    [onResize],
  );
  const onDoubleClick = useCallback(() => onResize(200, true), [onResize]);

  return (
    <div
      data-testid="studio-bottom"
      style={{ height }}
      className="flex flex-shrink-0 flex-col border-t bg-card"
    >
      {/* Resize sash — spans the top edge; double-click resets to the default height. */}
      <div
        role="separator"
        aria-orientation="horizontal"
        data-testid="studio-bottom-resize"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onDoubleClick={onDoubleClick}
        className="h-1.5 flex-shrink-0 cursor-row-resize hover:bg-primary/30"
        title={t('bottom.resizeHint', { defaultValue: 'Drag to resize · double-click to reset' })}
      />
      <div className="flex h-8 flex-shrink-0 items-stretch border-b">
        {TABS.map((tb) => (
          <button
            key={tb}
            type="button"
            onClick={() => setTab(tb)}
            className={cn(
              'relative px-3 text-xs font-medium transition-colors',
              tab === tb
                ? 'text-foreground after:absolute after:inset-x-0 after:top-0 after:h-0.5 after:bg-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`bottom.${tb}`, { defaultValue: tb })}
          </button>
        ))}
        {pinnedDefs.map((def) => (
          <span key={def.id} className="relative">
            <button
              type="button"
              onClick={() => setTab(def.id)}
              className={cn(
                'group relative pr-5 pl-3 text-xs font-medium transition-colors',
                tab === def.id
                  ? 'text-foreground after:absolute after:inset-x-0 after:top-0 after:h-0.5 after:bg-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(def.titleKey, { defaultValue: def.id })}
            </button>
            <button
              type="button"
              title={t('bottom.unpin', { defaultValue: 'Remove from the bottom panel' })}
              onClick={() => { onUnpinPanel(def.id); if (tab === def.id) setTab('jobs'); }}
              className="absolute right-0.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground/60 hover:bg-secondary hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <div className="relative">
          <button
            type="button"
            data-testid="studio-bottom-add-panel"
            title={t('bottom.addPanel', { defaultValue: 'Pin a panel here' })}
            onClick={() => setPickerOpen((o) => !o)}
            className="flex w-7 items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          {pickerOpen && (
            <div
              data-testid="studio-bottom-panel-picker"
              className="absolute bottom-8 right-0 z-50 w-[300px] rounded-lg border bg-card p-2 shadow-xl"
            >
              <div className="mb-2 px-1 text-xs font-semibold">
                {t('bottom.pickerTitle', { defaultValue: 'Pin a panel to the bottom' })}
              </div>
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('bottom.pickerSearch', { defaultValue: 'Find a panel…' })}
                  className="h-8 w-full rounded border bg-background pl-7 pr-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                  data-testid="studio-bottom-panel-picker-search"
                />
              </div>
              <div className="max-h-[240px] space-y-0.5 overflow-y-auto pr-1">
                {pickerList.map((panel) => (
                  <button
                    key={panel.id}
                    type="button"
                    data-testid={`studio-bottom-pin-${panel.id}`}
                    onClick={() => { onPinPanel(panel.id); setTab(panel.id); setPickerOpen(false); setQuery(''); }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-secondary"
                  >
                    <span className="min-w-0 flex-1 truncate">{t(panel.titleKey, { defaultValue: panel.id })}</span>
                    <span className="text-[10px] text-muted-foreground">{panel.category}</span>
                  </button>
                ))}
                {pickerList.length === 0 && (
                  <p className="px-2 py-2 text-xs text-muted-foreground">{t('bottom.pickerEmpty', { defaultValue: 'No panels match.' })}</p>
                )}
              </div>
              <p className="mt-2 px-1 text-[10px] text-muted-foreground">{t('bottom.pickerHint', { defaultValue: 'The panel lives here as its own tab; × returns it to the workspace picker. Saved with this workspace.' })}</p>
            </div>
          )}
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          title={t('bottom.collapse', { defaultValue: 'Collapse panel' })}
          className="flex w-8 items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {pinnedDefs.some((d) => d.id === tab) ? (
          (() => {
            const def = pinnedDefs.find((d) => d.id === tab) as StudioPanelDef;
            const PanelComponent = def.component;
            return (
              <div className="min-h-0 flex-1 overflow-auto" data-testid={`studio-bottom-panel-${def.id}`}>
                <PanelComponent
                  {...({ panelId: def.id, params: {}, api: makeStubApi(def.id) } as unknown as IDockviewPanelProps)}
                />
              </div>
            );
          })()
        ) : tab === 'notifications' ? (
          <NotificationsCompactFeed
            onOpen={(n) => {
              const link = notificationLink(n);
              if (link) followStudioLink(link, host, { bookId: host.bookId });
            }}
            onOpenFullPanel={() => openPanel('notifications', { focus: true })}
          />
        ) : tab === 'issues' ? (
          <StudioIssuesFeed />
        ) : (
          // Jobs — the compact projection of the same data spine the jobs-list dock panel
          // renders. The full dashboard is one click away in the feed header.
          <JobsStreamProvider>
            <JobsCompactFeed
              onOpenDetail={(service, jobId) => openPanel('job-detail', { params: { service, jobId } })}
              onOpenFullPanel={() => openPanel('jobs-list', { focus: true })}
            />
          </JobsStreamProvider>
        )}
      </div>
    </div>
  );
}
