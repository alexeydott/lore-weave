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
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { JobsStreamProvider } from '@/features/jobs/context/JobsStreamProvider';
import { JobsCompactFeed } from '@/features/jobs/components/JobsCompactFeed';
import { useStudioHost } from '../host/StudioHostProvider';
import { StudioIssuesFeed } from './StudioIssuesFeed';

type BottomTab = 'jobs' | 'issues';
const TABS: BottomTab[] = ['jobs', 'issues'];

export function StudioBottomPanel({
  onClose,
  height,
  onResize,
}: {
  onClose: () => void;
  height: number;
  /** (px, persist) — live during the drag, persisted on pointer-up (sidebar-sash contract). */
  onResize: (height: number, persist?: boolean) => void;
}) {
  const { t } = useTranslation('studio');
  const { openPanel } = useStudioHost();
  const [tab, setTab] = useState<BottomTab>('jobs');
  const drag = useRef<{ startY: number; startHeight: number } | null>(null);

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
        {tab === 'issues' ? (
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
