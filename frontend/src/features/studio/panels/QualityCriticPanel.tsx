// Studio Quality tab — `quality-critic`: the 4-dim critic (coherence / voice /
// pacing / canon) + per-chapter thread audit. DOCK-2 — thin wrapper over
// QualityReportSection + useWorkResolution, reused AS-IS. Per-chapter and
// on-demand (no book-wide critic aggregation exists yet — see the plan doc's
// reality map), so this adds a chapter picker + the shared ModelPicker.
import { useEffect, useState } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth';
import { ModelPicker, useUserModels } from '@/components/model-picker';
import { useEffectiveModelSelection } from '@/features/chat-ai-settings/context/ChatAiSettingsContext';
import { booksApi, type Chapter } from '@/features/books/api';
import { type QualityCritic } from '@/features/composition/api';
import { QualityReason, QualityScopeWarning } from "@/features/composition/components/QualityReportStatus";
import { QualityReportSection } from '@/features/composition/components/QualityReportSection';
import { useStudioHost } from '../host/StudioHostProvider';
import { useStudioPanel } from './useStudioPanel';
import { QualityWorkGate } from './QualityNoWorkState';
import { useQualityWork } from './useQualityWork';
import { useQualityBookRun } from './useQualityBookRun';
import { chapterDisplayTitle } from '../manuscript/partsTree';

const CHAPTER_PAGE_SIZE = 100;
type QualityModelSource = 'user_model' | 'platform_model';

function isQualityModelSource(source: string): source is QualityModelSource {
  return source === 'user_model' || source === 'platform_model';
}

// The 4 critic dimensions, in display order (mirrors QualityReportSection).
const DIMS: (keyof Pick<QualityCritic, 'coherence' | 'voice_match' | 'pacing' | 'canon_consistency'>)[] = [
  'coherence', 'voice_match', 'pacing', 'canon_consistency',
];

export function QualityCriticPanel(props: IDockviewPanelProps) {
  useStudioPanel('quality-critic', props.api);
  const { t } = useTranslation('studio');
  const { t: tc } = useTranslation('composition');
  const host = useStudioHost();
  const { accessToken } = useAuth();
  // `unavailable` (composition-service is DOWN) must NOT render as "no co-writer session yet" —
  // unconsulted is not empty. See useQualityWork / RUN-STATE DR-27.
  const work = useQualityWork(host.bookId, accessToken);
  const [modelRef, setModelRef] = useState('');
  // Inherit the full model descriptor, not only model_ref: a platform model sent as
  // `user_model` is a different (and usually invalid) model selection.
  const modelsQ = useUserModels({ capability: 'chat' });
  const firstChatModel = modelsQ.models?.[0]?.user_model_id ?? '';
  const cascadeSelection = useEffectiveModelSelection('chat');
  const inheritedModel = cascadeSelection && isQualityModelSource(cascadeSelection.model_source)
    ? { model_source: cascadeSelection.model_source, model_ref: cascadeSelection.model_ref }
    : null;
  const effectiveModel = modelRef
    ? { model_source: 'user_model' as const, model_ref: modelRef }
    : inheritedModel ?? (firstChatModel ? { model_source: 'user_model' as const, model_ref: firstChatModel } : null);
  const effectiveModelRef = effectiveModel?.model_ref ?? '';
  const effectiveModelSource = effectiveModel?.model_source ?? 'user_model';

  const [chapterId, setChapterId] = useState('');
  const chaptersQ = useQuery({
    queryKey: ['studio', 'quality-critic', 'chapters', host.bookId],
    queryFn: async () => {
      const items: Chapter[] = [];
      const cursors = new Set<string>();
      let cursor: string | null = null;
      let total: number | null = null;
      do {
        const page = await booksApi.listChaptersPage(accessToken!, host.bookId, {
          cursor, limit: CHAPTER_PAGE_SIZE, sort: 'sort_order',
        });
        if (items.length === 0) total = page.total;
        items.push(...page.items);
        cursor = page.next_cursor;
        if (cursor && cursors.has(cursor)) throw new Error('Chapter pagination returned a repeated cursor');
        if (cursor) cursors.add(cursor);
      } while (cursor);
      return { items, total };
    },
    enabled: !!accessToken,
  });

  const chapters = chaptersQ.data?.items ?? [];
  const projectId = work.kind === 'ready' ? work.projectId : null;
  const [batchScope, setBatchScope] = useState<'selected' | 'all'>('all');
  const controller = useQualityBookRun(projectId, host.bookId, accessToken, effectiveModel);
  const run = controller.run;
  const batch = run && ['pending', 'running'].includes(run.status) ? {
    done: run.completed, total: run.total,
    currentTitle: run.chapters.find((chapter) => chapter.chapter_id === run.current_chapter_id)?.title ?? '',
    stopping: run.stop_requested,
  } : null;
  const visibleBatchEntries = (run?.chapters ?? []).filter((chapter) => chapter.result || chapter.error).map((chapter) => ({
    chapterId: chapter.chapter_id, title: chapter.title,
    report: chapter.result?.report ?? null,
    failed: chapter.status === 'failed', error: chapter.error,
  }));
  useEffect(() => setChapterId(''), [host.bookId]);

  if (work.kind !== 'ready') return <QualityWorkGate state={work} testIdPrefix="quality-critic" bookId={host.bookId} token={accessToken} />;

  return (
    <div data-testid="studio-quality-critic-panel" className="flex h-full min-h-0 flex-col gap-2 overflow-auto p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <select
          data-testid="quality-critic-chapter-picker"
          aria-label={t('quality.pickChapter', { defaultValue: 'Pick a chapter' })}
          className="min-w-[10rem] rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
          value={chapterId}
          disabled={!!batch}
          onChange={(e) => setChapterId(e.target.value)}
        >
          <option value="">{t('quality.pickChapter', { defaultValue: 'Pick a chapter' })}</option>
          {chapters.map((c) => (
            <option key={c.chapter_id} value={c.chapter_id}>
              {chapterDisplayTitle(c)}
            </option>
          ))}
        </select>
        {chaptersQ.isError && (
          <span data-testid="quality-critic-chapters-error" className="text-[10px] text-rose-500">
            {t('quality.chaptersLoadError', { defaultValue: 'Could not load the chapter list.' })}
          </span>
        )}
        <ModelPicker
          capability="chat"
          value={effectiveModelRef || null}
          onChange={(id) => setModelRef(id ?? '')}
          placeholder={t('quality.pickModel', { defaultValue: 'Pick a model to analyze with…' })}
          compact
          disabled={!!batch}
        />
      </div>
      {chapterId ? (
        <QualityReportSection
          projectId={work.projectId}
          chapterId={chapterId}
          token={accessToken}
          modelRef={effectiveModelRef}
          modelSource={effectiveModelSource}
        />
      ) : (
        <div data-testid="quality-critic-no-chapter" className="p-4 text-center text-neutral-500">
          {t('quality.pickChapterHint', { defaultValue: 'Pick a chapter above to analyze its quality.' })}
        </div>
      )}

      <div className="mt-3 border-t pt-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-neutral-500">
            {t('quality.criticBatchTitle', { defaultValue: 'Whole-book critic pass' })}
          </span>
          <span className="ml-auto flex items-center gap-1 text-[10px]">
            {(['selected', 'all'] as const).map((scope) => (
              <button
                key={scope}
                type="button"
                data-testid={`quality-critic-batch-scope-${scope}`}
                aria-pressed={batchScope === scope}
                disabled={!!batch}
                onClick={() => setBatchScope(scope)}
                className={`rounded px-2 py-0.5 ${batchScope === scope ? 'bg-neutral-200 font-medium dark:bg-neutral-700' : 'text-neutral-400'}`}
              >
                {scope === 'selected'
                  ? t('quality.criticBatchSelected', { defaultValue: 'Selected chapter' })
                  : t('quality.criticBatchAll', { defaultValue: 'All chapters' })}
              </button>
            ))}
          </span>
        </div>

        {batch ? (
          <div className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600" />
            {t('quality.criticBatchRunning', {
              done: batch.done, total: batch.total, current: batch.currentTitle,
            })}
            <button
              type="button"
              data-testid="quality-critic-batch-stop"
              disabled={batch.stopping}
              onClick={() => void controller.stop()}
              className="ml-auto rounded border px-2 py-0.5 text-[10px] font-medium disabled:opacity-60"
            >
              {batch.stopping
                ? t('quality.criticBatchStopping', { defaultValue: 'Stopping after this chapter…' })
                : t('quality.criticBatchStop', { defaultValue: 'Stop after this chapter' })}
            </button>
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              data-testid="quality-critic-batch"
              onClick={() => void controller.prepare()}
              disabled={controller.busy || controller.loading || !effectiveModel || !projectId || chaptersQ.isLoading || chaptersQ.isError || chapters.length === 0 || batchScope === 'selected'}
              className="flex-1 rounded border border-sky-500/40 px-3 py-1.5 text-[11px] font-medium text-sky-600 hover:bg-sky-500/10 disabled:opacity-50"
            >
              {controller.stage === 'estimate' ? t('quality.criticBatchPreparingEstimate') : t('quality.criticBatchCta', { defaultValue: 'Analyze all chapters' })}
            </button>

          </div>
        )}

        {controller.historyError && (
          <div data-testid="quality-critic-history-error" role="alert" className="mt-2 text-[11px] text-amber-600">
            {t('quality.criticHistoryLoadError')}
            <button data-testid="quality-critic-history-retry" disabled={controller.historyRefreshing} onClick={() => void controller.retryHistory()} className="ml-2 underline">
              {t('quality.criticHistoryRetry')}
            </button>
          </div>
        )}
        {controller.error && (
          <div data-testid="quality-critic-batch-error" className="mt-2 text-[11px] text-rose-500">
            {controller.error.stage === 'estimate'
              ? t(controller.error.code === 'REQUEST_TIMEOUT' ? 'quality.criticBatchEstimateTimeout' : 'quality.criticBatchEstimateFailed')
              : controller.error.stage === 'start'
                ? t(controller.error.code === 'REQUEST_TIMEOUT' ? 'quality.criticBatchStartTimeout' : 'quality.criticBatchStartFailed')
                : t('quality.criticBatchStopFailed')}
            {controller.error.stage !== 'estimate' && <button disabled={controller.historyRefreshing} onClick={() => void controller.retryHistory()} className="ml-2 underline">{t('quality.criticHistoryRetry')}</button>}
          </div>
        )}

        {visibleBatchEntries.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2" data-testid="quality-critic-batch-results">
            {visibleBatchEntries.map((entry) => {
              const critic = entry.report?.critic;
              return (
                <li key={entry.chapterId} data-testid={`quality-critic-batch-entry-${entry.chapterId}`} className="rounded border p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="text-left font-medium hover:underline"
                      onClick={() => { setChapterId(entry.chapterId); setBatchScope('selected'); }}
                    >
                      {entry.title}
                    </button>
                    {entry.failed || critic?.error
                      ? <span className="text-[10px] text-rose-500">
                          {tc('qualityReasons.manualRetry')}
                        </span>
                      : critic && (
                        <span className="flex flex-wrap gap-1">
                          {DIMS.map((dimension) => (
                            <span key={dimension} className="rounded bg-neutral-100 px-1 py-px text-[9px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                              {tc(dimension)}: {critic[dimension] ?? '—'}/5
                            </span>
                          ))}
                        </span>
                      )}
                  </div>
                  {(entry.failed || critic?.error) && <QualityReason error={critic?.error ?? entry.error ?? 'unknown'} />}
                  <QualityScopeWarning scope={entry.report?.scope ?? critic?.scope} />
                  {critic && critic.violations.length > 0 && (
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {critic.violations.map((violation, index) => (
                        <li key={index} className="text-[11px] text-rose-500">⚠ {violation.why}{violation.span ? ` — “${violation.span}”` : ''}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {controller.estimate && !batch && (
          <div role="dialog" className="mt-2 text-xs">
            <div data-testid="quality-critic-batch-estimated-calls" data-calls={controller.estimate.estimated_calls_max} data-chapters={controller.estimate.total}>{t('quality.criticBatchEstimate', { calls: controller.estimate.estimated_calls_max, count: controller.estimate.total })}</div>
            <div data-testid="quality-critic-batch-estimated-cost" data-usd={controller.estimate.estimated_usd_max}>{t('quality.criticBatchEstimateCost', { cost: controller.estimate.estimated_usd_max.toFixed(4) })}</div>
            <button data-testid="quality-critic-batch-confirm" disabled={controller.busy} onClick={() => void controller.confirm()}>
              {t('quality.criticBatchConfirm')}
            </button>
          </div>
        )}
        {run && <div role="status" className="text-xs">{t('quality.criticBatchProgress', { completed: run.completed, failed: run.failed, total: run.total })}</div>}

      </div>
    </div>
  );
}
