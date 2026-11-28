import { useTranslation } from 'react-i18next';
import {
  useJobsDashboard,
} from '../hooks/useJobsDashboard';
import { useJobsConnection } from '../context/JobsStreamProvider';
import { useJobLive } from '../context/JobsStreamProvider';
import { effectiveJob, formatDuration } from '../lib';
import { isTerminal, jobKey, type Job } from '../types';
import { JobStatusBadge } from './JobStatusBadge';
import { JobProgress } from './JobProgress';
import { useUserModels } from '@/components/model-picker/useUserModels';

/** Status → dot color (compact rows carry a dot, not the full badge chip). */
const DOT: Record<string, string> = {
  pending: 'bg-muted-foreground/60',
  running: 'bg-blue-500 animate-pulse',
  paused: 'bg-amber-500',
  cancelling: 'bg-amber-500 animate-pulse',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  cancelled: 'bg-muted-foreground/60',
};

/** One compact bottom-panel row: dot · label · service · progress · duration.
 *  Reads its own live SSE overlay exactly like JobRow does (per-key subscription). */
function CompactRow({
  job: base,
  onOpenDetail,
}: {
  job: Job;
  onOpenDetail?: (service: string, jobId: string) => void;
}) {
  const { t } = useTranslation('jobs');
  const job = effectiveJob(base, useJobLive(jobKey(base)));
  const kindLabel = t(`kind.${job.kind}`, { defaultValue: job.kind });
  const label = job.title || kindLabel;
  const subtitle = job.model ? `${job.service} · ${job.model}` : job.service;
  const terminal = isTerminal(job.status);
  const duration = formatDuration(job.created_at, job.updated_at);
  return (
    <button
      type="button"
      data-testid="jobs-compact-row"
      onClick={() => onOpenDetail?.(job.service, job.job_id)}
      className="flex w-full items-center gap-2.5 border-b border-border/50 px-3 py-1.5 text-left text-xs hover:bg-accent/30"
    >
      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${DOT[job.status] ?? 'bg-muted-foreground/60'}`} />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium text-foreground">{label}</span>
        <span className="ml-2 text-muted-foreground">{subtitle}</span>
      </span>
      <span className="w-28 flex-shrink-0"><JobProgress progress={job.progress} detailStatus={job.detail_status} /></span>
      {terminal ? (
        <JobStatusBadge status={job.status} />
      ) : (
        <span className="flex-shrink-0 tabular-nums text-muted-foreground">{duration}</span>
      )}
    </button>
  );
}

/**
 * The bottom-panel jobs feed — purpose-built for the ~200px studio panel.
 * Same data spine as JobsList (useJobsDashboard over JobsStreamProvider, DOCK-2
 * no-fork), but a COMPACT projection: in-flight jobs with progress first; when
 * nothing is running, the most recent history rows in a muted register. The full
 * dashboard (summary cards / filters / paginated tables) stays in the jobs-list
 * dock panel — a one click away via the header link, never crammed in here.
 * (#user-report 2026-11-28: the full dashboard was unreadable at panel height.)
 */
export function JobsCompactFeed({
  onOpenDetail,
  onOpenFullPanel,
}: {
  onOpenDetail?: (service: string, jobId: string) => void;
  onOpenFullPanel?: () => void;
}) {
  const { t } = useTranslation('jobs');
  const d = useJobsDashboard();
  const conn = useJobsConnection();
  const { models: pricingModels } = useUserModels({ includeInactive: true });

  const activeItems: Job[] = d.active.data?.pages.flatMap((p) => p.items) ?? [];
  const historyItems: Job[] = d.history.data?.items ?? [];
  const failed = historyItems.filter((j) => j.status === 'failed').length;
  const rows = activeItems.length > 0 ? activeItems : historyItems.slice(0, 5);
  const live = conn === 'open';

  return (
    <div data-testid="jobs-compact-feed" className="flex min-h-0 flex-1 flex-col">
      {/* Header: live dot + counts + the full-dashboard escape hatch. */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b bg-secondary/40 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${live ? 'bg-green-500' : 'bg-muted-foreground/60'}`} />
          {live ? t('live.onShort', { defaultValue: 'live' }) : t('live.off', { defaultValue: 'offline' })}
        </span>
        <span data-testid="jobs-compact-counts">
          {t('compact.activeCount', { defaultValue: '{{n}} active', n: activeItems.length })}
          {' · '}
          {t('compact.failedCount', { defaultValue: '{{n}} failed', n: failed })}
        </span>
        <span className="flex-1" />
        {onOpenFullPanel && (
          <button
            type="button"
            data-testid="jobs-compact-full-panel"
            onClick={onOpenFullPanel}
            className="text-[11px] text-foreground/80 hover:text-foreground"
          >
            {t('compact.fullPanel', { defaultValue: 'Full dashboard →' })}
          </button>
        )}
      </div>
      {/* Rows. */}
      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="jobs-compact-rows">
        {d.active.isLoading || d.history.isLoading ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">{t('list.loading', { defaultValue: 'Loading…' })}</p>
        ) : rows.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">{t('list.empty', { defaultValue: 'No jobs yet.' })}</p>
        ) : (
          <>
            {activeItems.length === 0 && (
              <p className="px-3 py-1 text-[11px] uppercase tracking-wide text-muted-foreground/70">
                {t('list.noActive', { defaultValue: 'No active jobs.' })}
              </p>
            )}
            {rows.map((j) => (
              <CompactRow key={jobKey(j)} job={j} onOpenDetail={onOpenDetail} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
