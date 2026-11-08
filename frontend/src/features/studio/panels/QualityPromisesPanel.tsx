// Studio Quality tab — `quality-promises`: the open-promise debt ledger
// (narrative_thread table, generation-time detected). DOCK-2 — thin wrapper,
// reuses ThreadsPanel + useWorkResolution AS-IS from the LOOM composition
// workspace (no fork). Unlike that workspace's `narrative_thread_enabled`
// settings gate (which only declutters an always-visible sidebar), Quality is
// opt-in navigation by definition, so this always renders when a Work exists.
//
// #user-report 2026-11-08 — the ledger's only writer is the post-generation
// detection hook, gated per-Work and OFF by default — a book whose prose
// predates the feature showed an EMPTY panel with no path to fill it (and no
// hint that a gate even existed). This panel now owns the flow end-to-end:
// the setup card flips the gate (settings PATCH, merged), and
// «Проанализировать главу» runs the detection over a chosen ALREADY-WRITTEN
// chapter (POST /works/{id}/threads/detect, EDIT-tier — spends the co-author
// model's tokens).
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { IDockviewPanelProps } from 'dockview-react';
import { useAuth } from '@/auth';
import { booksApi } from '@/features/books/api';
import { compositionApi } from '@/features/composition/api';
import { chapterDisplayTitle } from '@/features/studio/manuscript/partsTree';
import { ThreadsPanel } from '@/features/composition/components/ThreadsPanel';
import { useStudioHost } from '../host/StudioHostProvider';
import { useStudioPanel } from './useStudioPanel';
import { QualityWorkGate } from './QualityNoWorkState';
import { useQualityWork } from './useQualityWork';
import { useActiveWorkId } from '@/features/composition/hooks/useActiveWork';
import { resolveActiveWork } from '@/features/composition/workSelect';

/** 24 PH18 — the Plan Hub's thread badge deep-links here with the `narrative_thread.id`, which IS
 *  what this panel lists (unlike the canon lens, whose rows carry no rule id). */
interface PromisesFocusParams {
  focusThreadId?: string | null;
}

export function QualityPromisesPanel(props: IDockviewPanelProps) {
  useStudioPanel('quality-promises', props.api);
  const focusThreadId = (props.params as PromisesFocusParams | undefined)?.focusThreadId ?? null;
  const host = useStudioHost();
  const { accessToken } = useAuth();
  const { t } = useTranslation('studio');
  const queryClient = useQueryClient();
  // `unavailable` (composition-service is DOWN) must NOT render as "no co-writer session yet" —
  // unconsulted is not empty. See useQualityWork / RUN-STATE DR-27.
  const work = useQualityWork(host.bookId, accessToken);

  // The active Work's settings gate — drives the setup card vs the analyze row.
  const { data: resolution } = useQuery({
    queryKey: ['composition', 'work', host.bookId],
    queryFn: () => compositionApi.resolveWork(host.bookId!, accessToken!),
    enabled: work.kind === 'ready' && !!host.bookId && !!accessToken,
  });
  const { data: activeWorkId } = useActiveWorkId(host.bookId, accessToken);
  const activeWork = resolveActiveWork(resolution, activeWorkId ?? null);
  const ntEnabled = activeWork?.settings?.narrative_thread_enabled === true;

  const [enabling, setEnabling] = useState(false);
  const enableTracking = async () => {
    if (!activeWork || !accessToken || enabling) return;
    setEnabling(true);
    try {
      // The server REPLACES the whole settings blob — merge over the current.
      await compositionApi.patchWork(activeWork.project_id, {
        settings: { ...(activeWork.settings ?? {}), narrative_thread_enabled: true },
      }, accessToken);
      await queryClient.invalidateQueries({ queryKey: ['composition', 'work', host.bookId] });
    } catch (e) {
      toast.error((e as Error).message || t('panels.quality-promises.enableFailed'));
    } finally {
      setEnabling(false);
    }
  };

  // Chapter backfill: the analyzed chapter is chosen by the author; the model
  // is the Work's default co-author model (SET-1..8 — no silent fallback).
  const defaultModelRef = (activeWork?.settings?.default_model_ref as string | undefined) || null;
  const { data: chapters } = useQuery({
    queryKey: ['books', 'chapters', host.bookId],
    queryFn: () => booksApi.listChapters(accessToken!, host.bookId!, { limit: 100 }),
    enabled: work.kind === 'ready' && ntEnabled && !!host.bookId && !!accessToken,
  });
  const [chapterId, setChapterId] = useState('');
  useEffect(() => {
    if (!chapterId && chapters?.items?.length) setChapterId(chapters.items[0].chapter_id);
  }, [chapters, chapterId]);
  const [analyzing, setAnalyzing] = useState(false);
  const analyzeChapter = async () => {
    if (!activeWork || !accessToken || !chapterId || !defaultModelRef || analyzing) return;
    setAnalyzing(true);
    try {
      const r = await compositionApi.detectThreads(activeWork.project_id, {
        chapter_id: chapterId,
        model_source: 'user_model',
        model_ref: defaultModelRef,
      }, accessToken);
      if (r.status === 'degraded' || r.status === 'empty') {
        toast.error(t('panels.quality-promises.detectFailed'));
      } else {
        toast.success(t('panels.quality-promises.detectOk', { opened: r.opened, paid: r.paid }));
      }
      await queryClient.invalidateQueries({ queryKey: ['composition', 'threads', activeWork.project_id] });
    } catch (e) {
      toast.error((e as Error).message || t('panels.quality-promises.detectFailed'));
    } finally {
      setAnalyzing(false);
    }
  };

  if (work.kind !== 'ready') return <QualityWorkGate state={work} testIdPrefix="quality-promises" bookId={host.bookId} token={accessToken} />;

  return (
    <div data-testid="studio-quality-promises-panel" className="h-full min-h-0 overflow-auto">
      {!ntEnabled && activeWork && (
        <div className="m-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-xs text-muted-foreground">{t('panels.quality-promises.guideBody')}</p>
          <button
            type="button"
            onClick={() => void enableTracking()}
            disabled={enabling}
            data-testid="quality-promises-enable"
            className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:brightness-110 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {enabling ? t('panels.quality-promises.enabling') : t('panels.quality-promises.enableCta')}
          </button>
        </div>
      )}
      {ntEnabled && (
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-lg border bg-card p-2">
          <select
            value={chapterId}
            onChange={(e) => setChapterId(e.target.value)}
            data-testid="quality-promises-chapter"
            className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-[11px] text-foreground"
          >
            {(chapters?.items ?? []).map((ch) => (
              <option key={ch.chapter_id} value={ch.chapter_id}>
                {chapterDisplayTitle(ch)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void analyzeChapter()}
            disabled={analyzing || !chapterId || !defaultModelRef}
            title={!defaultModelRef ? t('panels.quality-promises.needModel') : undefined}
            data-testid="quality-promises-analyze"
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:brightness-110 disabled:opacity-50"
          >
            <Sparkles className="h-3 w-3" />
            {analyzing ? t('panels.quality-promises.analyzing') : t('panels.quality-promises.analyzeCta')}
          </button>
        </div>
      )}
      <ThreadsPanel projectId={work.projectId} token={accessToken} enabled focusThreadId={focusThreadId} />
    </div>
  );
}
