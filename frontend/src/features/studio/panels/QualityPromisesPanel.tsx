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
import type { ThreadsAssistantReport } from '@/features/composition/types';
import { chapterDisplayTitle } from '@/features/studio/manuscript/partsTree';
import { ModelPicker, useUserModels } from '@/components/model-picker';
import { useEffectiveModel } from '@/features/chat-ai-settings/context/ChatAiSettingsContext';
import { clampOutputBudget } from '@/lib/outputBudget';
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

  // ── Model cascade for the detect/assistant passes (#user-report 2026-11-08) ──
  // Panel-local re-selection ▸ the shared cascade (session ▸ Work ▸ account,
  // resolved server-side) ▸ the Work's default_model_ref ▸ the first chat model.
  // A fallback BELOW the cascade tier shows a warning (SET-1..8 — no silent
  // model choice); the ModelPicker allows the re-selection, and its changes
  // propagate everywhere via the shared model-picker invalidation.
  const modelsState = useUserModels({ capability: 'chat' });
  const modelList = modelsState.models ?? [];
  const inheritedModel = useEffectiveModel('chat');
  const [pickedModel, setPickedModel] = useState('');
  const workDefaultRef = (activeWork?.settings?.default_model_ref as string | undefined) || '';
  const effectiveModelRef =
    pickedModel || inheritedModel || workDefaultRef || modelList[0]?.user_model_id || '';
  const selectedModel = modelList.find((m) => m.user_model_id === effectiveModelRef);
  const modelFallback = !pickedModel && !inheritedModel;
  const maxOutputTokens = clampOutputBudget(selectedModel?.max_output_tokens);
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
    if (!activeWork || !accessToken || !chapterId || !effectiveModelRef || analyzing) return;
    setAnalyzing(true);
    try {
      const r = await compositionApi.detectThreads(activeWork.project_id, {
        chapter_id: chapterId,
        model_source: 'user_model',
        model_ref: effectiveModelRef,
        max_output_tokens: maxOutputTokens ?? undefined,
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

  // ── ИИ-помощник (#user-report 2026-11-08) — read-only analysis report ──────
  const [report, setReport] = useState<ThreadsAssistantReport | null>(null);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const runAssistant = async () => {
    if (!activeWork || !accessToken || !chapterId || !effectiveModelRef || assistantBusy) return;
    setAssistantBusy(true);
    setReport(null);
    try {
      const r = await compositionApi.threadsAssistant(activeWork.project_id, {
        chapter_id: chapterId,
        model_source: 'user_model',
        model_ref: effectiveModelRef,
        max_output_tokens: maxOutputTokens ?? undefined,
      }, accessToken);
      setReport(r);
      if (r.degraded) toast.error(t('panels.quality-promises.assistantFailed'));
    } catch (e) {
      toast.error((e as Error).message || t('panels.quality-promises.assistantFailed'));
    } finally {
      setAssistantBusy(false);
    }
  };
  const [adopting, setAdopting] = useState<string | null>(null);
  const adoptPromise = async (p: { kind: string; summary: string }) => {
    if (!activeWork || !accessToken || adopting) return;
    setAdopting(p.summary);
    try {
      const r = await compositionApi.threadsAdopt(activeWork.project_id, {
        items: [{ kind: p.kind, summary: p.summary }],
      }, accessToken);
      if (r.created > 0) {
        setReport((prev) => (prev ? { ...prev, promises: prev.promises.filter((x) => x.summary !== p.summary) } : prev));
        toast.success(t('panels.quality-promises.adopted'));
        await queryClient.invalidateQueries({ queryKey: ['composition', 'threads', activeWork.project_id] });
      }
    } catch (e) {
      toast.error((e as Error).message || t('panels.quality-promises.assistantFailed'));
    } finally {
      setAdopting(null);
    }
  };
  const adoptAllPromises = async () => {
    if (!activeWork || !accessToken || !report || adopting) return;
    const items = report.promises.map((p) => ({ kind: p.kind, summary: p.summary }));
    if (items.length === 0) return;
    setAdopting('__all__');
    try {
      const r = await compositionApi.threadsAdopt(activeWork.project_id, { items }, accessToken);
      if (r.created > 0) {
        setReport((prev) => (prev ? { ...prev, promises: [] } : prev));
        toast.success(t('panels.quality-promises.adoptedAll', { count: r.created }));
        await queryClient.invalidateQueries({ queryKey: ['composition', 'threads', activeWork.project_id] });
      }
    } catch (e) {
      toast.error((e as Error).message || t('panels.quality-promises.assistantFailed'));
    } finally {
      setAdopting(null);
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
        <>
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
          {/* #user-report — the model re-selection lives HERE (the cascade:
              session ▸ Work ▸ account resolves elsewhere; this picker overrides) */}
          <ModelPicker
            capability="chat"
            compact
            value={effectiveModelRef || null}
            onChange={(id) => setPickedModel(id ?? '')}
            ariaLabel={t('panels.quality-promises.modelAria')}
            placeholder={t('panels.quality-promises.modelPlaceholder')}
          />
          <button
            type="button"
            onClick={() => void analyzeChapter()}
            disabled={analyzing || !chapterId || !effectiveModelRef}
            title={!effectiveModelRef ? t('panels.quality-promises.needModel') : undefined}
            data-testid="quality-promises-analyze"
            className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            <Sparkles className="h-3 w-3" />
            {analyzing ? t('panels.quality-promises.analyzing') : t('panels.quality-promises.backfillCta')}
          </button>
          <button
            type="button"
            onClick={() => void runAssistant()}
            disabled={assistantBusy || !chapterId || !effectiveModelRef}
            title={!effectiveModelRef ? t('panels.quality-promises.needModel') : undefined}
            data-testid="quality-promises-assistant"
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:brightness-110 disabled:opacity-50"
          >
            <Sparkles className="h-3 w-3" />
            {assistantBusy ? t('panels.quality-promises.assistantRunning') : t('panels.quality-promises.assistantCta')}
          </button>
        </div>
        {modelFallback && effectiveModelRef && (
          <p className="mx-3 mb-2 text-[10px] text-amber-500">
            {t('panels.quality-promises.modelWarn', {
              model: selectedModel
                ? (selectedModel.alias || selectedModel.provider_model_name)
                : t('panels.quality-promises.needModel'),
            })}
          </p>
        )}
        {assistantBusy && (
          <div className="mx-3 mb-3 flex items-center gap-2 rounded-lg border bg-card p-2 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 animate-spin text-primary" />
            {t('panels.quality-promises.assistantRunning')}
          </div>
        )}
        {report && (
          <div className="mx-3 mb-3 space-y-3" data-testid="quality-promises-report">
            {/* Proposed unclosed promises — adoptable */}
            {report.promises.length > 0 && (
              <div className="rounded-lg border bg-card p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('panels.quality-promises.assistantPromises', { count: report.promises.length })}
                  </span>
                  <button
                    type="button"
                    onClick={() => void adoptAllPromises()}
                    disabled={adopting === '__all__'}
                    className="rounded border border-primary/40 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
                  >
                    {t('panels.quality-promises.adoptAll')}
                  </button>
                </div>
                <ul className="space-y-1.5">
                  {report.promises.map((p, i) => (
                    <li key={i} className="rounded bg-background/60 p-2 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 flex-1">{p.summary}</span>
                        <button
                          type="button"
                          onClick={() => void adoptPromise(p)}
                          disabled={adopting !== null}
                          data-testid={`quality-promises-adopt-${i}`}
                          className="shrink-0 rounded border border-primary/40 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
                        >
                          {t('panels.quality-promises.adopt')}
                        </button>
                      </div>
                      {p.quote && <p className="mt-1 truncate text-[10px] italic text-muted-foreground">«{p.quote}»</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* Critic notes */}
            {report.critic.length > 0 && (
              <div className="rounded-lg border bg-card p-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('panels.quality-promises.assistantCritic')}
                </span>
                <ul className="mt-1.5 list-inside list-disc space-y-1 text-xs">
                  {report.critic.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            )}
            {/* Promise chains */}
            {report.chains.length > 0 && (
              <div className="rounded-lg border bg-card p-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('panels.quality-promises.assistantChains')}
                </span>
                <ul className="mt-1.5 space-y-1.5 text-xs">
                  {report.chains.map((c, i) => (
                    <li key={i}>
                      <span className="font-medium">{c.summary}</span>
                      {c.anchor && <span className="ml-1 text-[10px] text-muted-foreground">— {c.anchor}</span>}
                      {c.beats && c.beats.length > 0 && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{c.beats.join(' → ')}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* Canon inconsistencies */}
            {report.canon_issues.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-destructive">
                  {t('panels.quality-promises.assistantCanon')}
                </span>
                <ul className="mt-1.5 list-inside list-disc space-y-1 text-xs">
                  {report.canon_issues.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
        </>
      )}
      <ThreadsPanel projectId={work.projectId} token={accessToken} enabled focusThreadId={focusThreadId} />
    </div>
  );
}
