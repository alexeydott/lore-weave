import { useState } from 'react';
import { SceneMotifEditor } from './SceneMotifEditor';
// W6 §3.4 (mockup 07-A) — the conformance DOCK PANEL. Coarse chapter-scope only
// (P1; the arc-level dashboard 07-B is P4/W10). Orchestrates the scene rows + the
// Tier-W re-run confirm + the empty/loading/error states. Holds no logic.
import { useTranslation } from 'react-i18next';
import { MotifStateBoundary } from './MotifStateBoundary';
import { ConformanceSceneRow } from './ConformanceSceneRow';
import { CostConfirmCard } from './CostConfirmCard';
import { useConformanceTrace } from '../hooks/useConformanceTrace';

type Props = {
  bookId?: string;
  projectId: string | undefined;
  chapterId: string | undefined;
  token: string | null;
  /** BYOK model for the Tier-W re-run (composition_conformance_run). No model ⇒ the Re-run
   *  button is disabled with a hint; the read + regenerate still work. */
  modelRef?: string | null;
  modelSource?: 'user_model' | 'platform_model';
  /** §2#6 loop-connect — deep-link to the scene-inspector for a scene (to bind/fix a beat). The
   *  host-owning panel wires it to host.publish + openPanel('scene-inspector'). */
  onOpenScene?: (sceneId: string, chapterId: string) => void;
};

export function ConformanceTraceView({ projectId, chapterId, token, modelRef, modelSource, onOpenScene, bookId }: Props) {
  const { t } = useTranslation('composition');
  const { t: studioT } = useTranslation('studio');
  const [editing, setEditing] = useState<{ sceneId: string; id: number }>();
  const trace = useConformanceTrace(projectId, chapterId, token, modelRef, modelSource);
  const conf = trace.conformance;
  const scenes = conf?.scenes ?? [];
  const isEmpty = !trace.isLoading && !trace.isError && scenes.length === 0;
  // The reader emits no chapter-level conform_count — derive [conforming, judged]
  // from the per-scene verdicts (a scene counts only once both binary flags resolved).
  const judged = scenes.filter(
    (s) => (!s.check_status || s.check_status === 'checked') && s.conformance && typeof s.conformance.beat_realized === 'boolean' && typeof s.conformance.tension_band_match === 'boolean',
  );
  const conforming = judged.filter((s) => s.conformance!.beat_realized && s.conformance!.tension_band_match).length;

  if (!projectId || !chapterId || !token) return <div data-testid="conformance-no-chapter">{t('motif.conf.noChapter')}</div>;

  return (
    <div data-testid="conformance-trace-view" className="flex h-full flex-col gap-2 overflow-auto p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
          {t('motif.conf.title', { defaultValue: 'Conformance' })}
          {/* FE-derived [conforming/judged] count (the reader emits no conform_count). */}
          {judged.length > 0 && (
            <span className="ml-2 text-xs text-neutral-500" data-testid="conformance-count">{conforming}/{judged.length}</span>
          )}
        </div>
        <button
          type="button"
          data-testid="conformance-rerun"
          className="rounded border border-amber-400 px-2 py-0.5 text-xs text-amber-700 disabled:opacity-50 dark:text-amber-300"
          disabled={!trace.canRerun || trace.isLoading || trace.isError || scenes.length === 0 || trace.mintRun.isPending || trace.confirmRun.isPending || !!trace.estimate}
          title={!trace.canRerun ? t('motif.conf.rerunNeedsModel', { defaultValue: 'Pick a model to re-run conformance' }) : undefined}
          onClick={() => trace.mintRun.mutate()}
        >
          {t('motif.conf.rerun', { defaultValue: 'Re-run' })}
        </button>
      </div>

      {trace.actionError && <p role='alert'>{t('motif.conf.actionError')}</p>}
      {(trace.mintRun.isPending || trace.confirmRun.isPending || trace.regenerateScene.isPending) && <p role='status'>{t('motif.conf.running')}</p>}
      {conf?.last_run && <p data-testid='conformance-snapshot'>{t('motif.conf.snapshot', { time: conf.last_run.computed_at ?? conf.last_run.completed_at ?? conf.last_run.created_at ?? '—' })}</p>}
      {/* Tier-W re-run confirm (mint→confirm) */}
      {trace.estimate && (
        <CostConfirmCard
          estimate={trace.estimate}
          whatItDoes={t('motif.conf.rerunWhat', { defaultValue: 'Re-check every scene in this chapter against its planned beat.' })}
          confirming={trace.confirmRun.isPending}
          onConfirm={() => trace.confirmRun.mutate()}
          onCancel={trace.cancelRun}
        />
      )}

      <MotifStateBoundary isLoading={trace.isLoading} isError={trace.isError} onRetry={() => trace.refetch()} skeleton="rows">
        {isEmpty ? (
          <div data-testid="conformance-empty" className="p-4 text-center text-xs text-neutral-500">
            <p>{t('motif.conf.empty', { defaultValue: 'Not generated yet — generate scenes to see conformance.' })}</p>
            {/* §2#6 loop-connect — the empty state is a dead-end without a next step; deep-link to the
                scene browser where the user chooses which scene to bind. */}
            {onOpenScene && chapterId && (
              <button
                type="button"
                data-testid="conformance-empty-bind-cta"
                onClick={() => onOpenScene('', chapterId)}
                className="mt-2 rounded border border-amber-400 px-2 py-0.5 text-[11px] text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/30"
              >
                {t('motif.conf.bindCta', { defaultValue: 'Choose a scene to bind →' })}
              </button>
            )}
          </div>
        ) : (
          <div>
            {scenes.map((s, index) => (
              <ConformanceSceneRow
                key={s.outline_node_id}
                scene={s}
                sceneLabel={s.title?.trim() || `${studioT('panels.scene-inspector.links.untitledScene', { number: index + 1 })} · ${chapterId}`}
                editor={bookId && projectId && chapterId ? <SceneMotifEditor projectId={projectId} bookId={bookId} chapterId={chapterId} sceneId={s.outline_node_id} sceneTitle={s.title?.trim() || `${studioT('panels.scene-inspector.links.untitledScene', { number: index + 1 })} · ${chapterId}`} token={token} request={editing?.sceneId === s.outline_node_id ? editing : undefined} /> : undefined}
                onOpenScene={bookId ? (sid) => setEditing({ sceneId: sid, id: Date.now() }) : onOpenScene && chapterId ? (sid) => onOpenScene(sid, chapterId) : undefined}
                // No model resolved ⇒ no `onRegenerate` ⇒ the row draws no button, rather than
                // one that fails on click. The panel already resolves `modelRef` for the judge.
                onRegenerate={trace.canRerun && !trace.regenerateScene.isPending ? (id) => trace.regenerateScene.mutate(id) : undefined}
              />
            ))}
          </div>
        )}
      </MotifStateBoundary>
    </div>
  );
}
