// Studio Quality tab — `quality-critic`: the 4-dim critic (coherence / voice /
// pacing / canon) + per-chapter thread audit. DOCK-2 — thin wrapper over
// QualityReportSection + useWorkResolution, reused AS-IS. Per-chapter and
// on-demand (no book-wide critic aggregation exists yet — see the plan doc's
// reality map), so this adds a chapter picker + the shared ModelPicker.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth';
import { ModelPicker, useUserModels } from '@/components/model-picker';
import { useEffectiveModelSelection } from '@/features/chat-ai-settings/context/ChatAiSettingsContext';
import { booksApi, type Chapter } from '@/features/books/api';
import { compositionApi, type QualityCritic, type QualityReportResponse } from '@/features/composition/api';
import { QualityReason, QualityScopeWarning } from "@/features/composition/components/QualityReportStatus";
import { QualityReportSection } from '@/features/composition/components/QualityReportSection';
import { useStudioHost } from '../host/StudioHostProvider';
import { useStudioPanel } from './useStudioPanel';
import { QualityWorkGate } from './QualityNoWorkState';
import { useQualityWork } from './useQualityWork';
import { chapterDisplayTitle } from '../manuscript/partsTree';

const CHAPTER_PAGE_SIZE = 100;
type QualityModelSource = 'user_model' | 'platform_model';

type BatchEntry = {
  chapterId: string;
  title: string;
  sortOrder: number;
  draftUpdatedAt: string | null;
  draftRevisionCount: number | null;
  report: Pick<QualityReportResponse['report'], 'critic' | 'scope'> | null;
  failed?: boolean;
  error?: string;
};

type BatchProgress = {
  done: number;
  total: number;
  currentTitle: string;
  stopping: boolean;
};

function isQualityCritic(value: unknown): value is QualityCritic {
  if (!value || typeof value !== 'object') return false;
  const critic = value as Record<string, unknown>;
  const scores = ['coherence', 'voice_match', 'pacing', 'canon_consistency'];
  return scores.every((key) => critic[key] === null || typeof critic[key] === 'number')
    && Array.isArray(critic.violations)
    && critic.violations.every((violation) => {
      if (!violation || typeof violation !== 'object') return false;
      const item = violation as Record<string, unknown>;
      return typeof item.rule_id === 'string'
        && typeof item.violated === 'boolean'
        && typeof item.why === 'string'
        && typeof item.span === 'string';
    })
    && (critic.error === undefined || typeof critic.error === 'string');
}

function readBatchEntries(key: string): BatchEntry[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is BatchEntry => {
      if (!entry || typeof entry !== 'object') return false;
      const item = entry as Record<string, unknown>;
      const report = item.report;
      const reportValid = report === null || (
        typeof report === 'object'
        && report !== null
        && isQualityCritic((report as Record<string, unknown>).critic)
      );
      return typeof item.chapterId === 'string'
        && typeof item.title === 'string'
        && typeof item.sortOrder === 'number'
        && (item.draftUpdatedAt === null || typeof item.draftUpdatedAt === 'string')
        && (item.draftRevisionCount === null || typeof item.draftRevisionCount === 'number')
        && reportValid
        && (item.failed === undefined || typeof item.failed === 'boolean')
        && (item.error === undefined || typeof item.error === 'string');
    });
  } catch {
    return [];
  }
}

function sameDraft(entry: BatchEntry | undefined, chapter: Chapter): boolean {
  const hasDraftVersion = chapter.draft_updated_at != null || chapter.draft_revision_count != null;
  return !!entry
    && hasDraftVersion
    && !entry.failed
    && !!entry.report
    && !entry.report.critic.error
    && !(entry.report.scope?.partial || entry.report.critic.scope?.partial)
    && entry.draftUpdatedAt === (chapter.draft_updated_at ?? null)
    && entry.draftRevisionCount === (chapter.draft_revision_count ?? null);
}

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
  const batchKey = `lw_critic_batch:${host.bookId}:${projectId ?? 'no-work'}:${effectiveModelSource}:${effectiveModelRef || 'no-model'}`;
  const [batchEntries, setBatchEntries] = useState<BatchEntry[]>(() => readBatchEntries(batchKey));
  const [batchEntriesKey, setBatchEntriesKey] = useState(batchKey);
  const [batchScope, setBatchScope] = useState<'selected' | 'all'>('all');
  const [batch, setBatch] = useState<BatchProgress | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const batchStop = useRef(false);
  const batchRunning = useRef(false);
  const mounted = useRef(false);
  const activeBatchKey = useRef<string | null>(null);
  const visibleBatchEntries = batchEntriesKey === batchKey ? batchEntries : [];
  const entriesByChapter = useMemo(
    () => new Map(visibleBatchEntries.map((entry) => [entry.chapterId, entry])),
    [visibleBatchEntries],
  );
  const pickerChapter = chapters.find((chapter) => chapter.chapter_id === chapterId);
  const chaptersToAnalyze = useMemo(
    () => chapters.filter((chapter) => !sameDraft(entriesByChapter.get(chapter.chapter_id), chapter)),
    [chapters, entriesByChapter],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      batchStop.current = true;
      activeBatchKey.current = null;
    };
  }, []);

  // A panel may switch Works or models while mounted. Do not show or persist another scope's cache;
  // if a pass is active, stop its queue after the current chapter finishes.
  useEffect(() => {
    batchStop.current = true;
    activeBatchKey.current = null;
    setBatch(null);
    setBatchError(null);
    setBatchEntries(readBatchEntries(batchKey));
    setBatchEntriesKey(batchKey);
    return () => {
      batchStop.current = true;
      activeBatchKey.current = null;
    };
  }, [batchKey]);

  useEffect(() => {
    if (batchEntriesKey !== batchKey || visibleBatchEntries.length === 0) return;
    try {
      localStorage.setItem(batchKey, JSON.stringify(visibleBatchEntries));
    } catch { /* private mode / quota — in-memory only */ }
  }, [batchKey, batchEntriesKey, visibleBatchEntries]);

  useEffect(() => setChapterId(''), [host.bookId]);

  const analyzeChapter = async (
    chapter: Chapter,
    entries: Map<string, BatchEntry>,
    runKey: string,
    total: number,
    done: number,
  ) => {
    if (!accessToken || !projectId || !effectiveModel) return;
    if (mounted.current && activeBatchKey.current === runKey) {
      setBatch({ done, total, currentTitle: chapterDisplayTitle(chapter), stopping: false });
    }
    let entry: BatchEntry;
    try {
      const response = await compositionApi.qualityReport(projectId, {
        chapterId: chapter.chapter_id,
        modelRef: effectiveModel.model_ref,
        modelSource: effectiveModel.model_source,
      }, accessToken);
      const critic = isQualityCritic(response.report?.critic) ? response.report.critic : null;
      entry = {
        chapterId: chapter.chapter_id,
        title: chapterDisplayTitle(chapter),
        sortOrder: chapter.sort_order,
        draftUpdatedAt: chapter.draft_updated_at ?? null,
        draftRevisionCount: chapter.draft_revision_count ?? null,
        report: critic ? { critic, scope: response.report.scope ?? critic.scope } : null,
        failed: !critic || !!critic.error,
        error: critic?.error || (!critic ? 'Quality report returned no critic result' : undefined),
      };
    } catch (error) {
      entry = {
        chapterId: chapter.chapter_id,
        title: chapterDisplayTitle(chapter),
        sortOrder: chapter.sort_order,
        draftUpdatedAt: chapter.draft_updated_at ?? null,
        draftRevisionCount: chapter.draft_revision_count ?? null,
        report: null,
        failed: true,
        error: (error as Error).message || 'Quality analysis failed',
      };
    }
    entries.set(chapter.chapter_id, entry);
    if (!mounted.current || activeBatchKey.current !== runKey) return;
    setBatchEntries([...entries.values()].sort((a, b) => a.sortOrder - b.sortOrder));
    setBatchEntriesKey(runKey);
    setBatch((state) => state ? { ...state, done: done + 1 } : null);
  };

  const runBatch = async () => {
    if (batchRunning.current || !accessToken || !projectId || !effectiveModel || chaptersQ.isLoading) return;
    if (batchScope === 'selected' && !pickerChapter) return;
    const queue = batchScope === 'selected' && pickerChapter ? [pickerChapter] : chapters;
    if (queue.length === 0) return;

    batchRunning.current = true;
    batchStop.current = false;
    activeBatchKey.current = batchKey;
    setBatchError(null);
    const entries = new Map(visibleBatchEntries.map((entry) => [entry.chapterId, entry]));
    let done = 0;
    const total = queue.length;
    setBatch({ done, total, currentTitle: '', stopping: false });
    try {
      for (const chapter of queue) {
        if (batchStop.current) break;
        const existing = entries.get(chapter.chapter_id);
        if (batchScope === 'all' && sameDraft(existing, chapter)) {
          done += 1;
          if (mounted.current && activeBatchKey.current === batchKey) {
            setBatch({ done, total, currentTitle: chapterDisplayTitle(chapter), stopping: false });
          }
          continue;
        }
        await analyzeChapter(chapter, entries, batchKey, total, done);
        done += 1;
      }
    } catch (error) {
      if (mounted.current && activeBatchKey.current === batchKey) {
        setBatchError(t('quality.criticBatchFailed'));
      }
    } finally {
      batchRunning.current = false;
      if (activeBatchKey.current === batchKey) {
        activeBatchKey.current = null;
        if (mounted.current) setBatch(null);
      }
    }
  };

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
              onClick={() => {
                batchStop.current = true;
                setBatch((state) => state ? { ...state, stopping: true } : null);
              }}
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
              onClick={() => void runBatch()}
              disabled={!effectiveModel || !projectId || chaptersQ.isLoading || chaptersQ.isError || (batchScope === 'selected' ? !chapterId : chapters.length === 0)}
              className="flex-1 rounded border border-sky-500/40 px-3 py-1.5 text-[11px] font-medium text-sky-600 hover:bg-sky-500/10 disabled:opacity-50"
            >
              {batchScope === 'selected'
                ? t('quality.criticBatchSelectedCta', { defaultValue: 'Analyze selected chapter' })
                : chaptersToAnalyze.length > 0
                  ? t('quality.criticBatchCta', { defaultValue: 'Analyze all chapters' })
                  : t('quality.criticBatchDone', { defaultValue: 'All chapters analyzed' })}
            </button>
            {batchScope === 'all' && chaptersToAnalyze.length > 0 && visibleBatchEntries.length > 0 && (
              <span className="text-[10px] text-neutral-500">
                {t('quality.criticBatchRemaining', { count: chaptersToAnalyze.length, defaultValue: '{{count}} remaining' })}
              </span>
            )}
          </div>
        )}

        {batchError && (
          <div data-testid="quality-critic-batch-error" className="mt-2 text-[11px] text-rose-500">
            {batchError}
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
                  {(entry.failed || critic?.error) && <QualityReason error={critic?.error ?? entry.error ?? 'critic_unavailable'} />}
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

        {visibleBatchEntries.length > 0 && !batch && (
          <button
            type="button"
            data-testid="quality-critic-batch-clear"
            onClick={() => {
              setBatchEntries([]);
              setBatchEntriesKey(batchKey);
              try { localStorage.removeItem(batchKey); } catch { /* private mode */ }
            }}
            className="mt-2 text-[10px] text-neutral-400 hover:text-foreground"
          >
            {t('quality.criticBatchClear', { defaultValue: 'Clear results' })}
          </button>
        )}
      </div>
    </div>
  );
}
