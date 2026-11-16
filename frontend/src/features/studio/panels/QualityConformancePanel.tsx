// S4 · 3c — `quality-conformance`: the beat-by-beat "did the prose realize the plan?"
// trace (DOCK-8 sibling of quality-critic/coverage/canon). The Studio's answer was only a
// red/green dot (useConformanceStatus rollup); the full per-scene trace was legacy-only.
// Thin wrapper over ConformanceTraceView, mirroring QualityCriticPanel: a chapter picker +
// the shared ModelPicker (the Tier-W re-run is BYOK; regenerate + read need no model).
// This panel answers spec-vs-PROSE; arc_template_drift (spec-vs-template) is Wave 4's.
import { useState } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth';
import { ModelPicker, useUserModels } from '@/components/model-picker';
import { useEffectiveModelSelection } from '@/features/chat-ai-settings/context/ChatAiSettingsContext';
import { booksApi } from '@/features/books/api';
import { ConformanceTraceView } from '@/features/composition/motif/components/ConformanceTraceView';
import { useStudioHost } from '../host/StudioHostProvider';
import { useStudioPanel } from './useStudioPanel';
import { QualityWorkGate } from './QualityNoWorkState';
import { useQualityWork } from './useQualityWork';
import { chapterDisplayTitle } from '../manuscript/partsTree';

const CHAPTER_PAGE_SIZE = 100;

export function QualityConformancePanel(props: IDockviewPanelProps) {
  useStudioPanel('quality-conformance', props.api);
  const { t } = useTranslation('studio');
  const host = useStudioHost();
  const { accessToken } = useAuth();
  const work = useQualityWork(host.bookId, accessToken);
  const [modelRef, setModelRef] = useState('');
  // #user-report 2026-11-08 — inherit the model cascade (session ▸ Work ▸
  // account, resolved server-side) instead of starting EMPTY: the empty state
  // silently disabled the tool's Run button with no hint. The picker still
  // allows a re-selection (changes propagate via the shared invalidation).
  const modelsQ = useUserModels({ capability: 'chat' });
  const firstChatModel = modelsQ.models?.[0]?.user_model_id ?? '';
  const cascadeSelection = useEffectiveModelSelection('chat');
  const effectiveModel = modelRef
    ? { model_source: 'user_model' as const, model_ref: modelRef }
    : (cascadeSelection?.model_source === 'user_model' || cascadeSelection?.model_source === 'platform_model' ? cascadeSelection : null) ?? (firstChatModel ? { model_source: 'user_model' as const, model_ref: firstChatModel } : null);
  const effectiveModelRef = effectiveModel?.model_ref ?? '';

  const scope = JSON.stringify([host.bookId, work.kind === 'ready' ? work.projectId : null, accessToken]);
  const [selection, setSelection] = useState({ scope, chapterId: '' });
  const chapterId = selection.scope === scope ? selection.chapterId : '';

  const chaptersQ = useQuery({
    queryKey: ['studio', 'quality-conformance', 'chapters', host.bookId, accessToken],
    queryFn: async () => {
      const items: Awaited<ReturnType<typeof booksApi.listChaptersPage>>['items'] = [];
      const cursors = new Set<string>();
      let cursor: string | null = null;
      do {
        const page = await booksApi.listChaptersPage(accessToken!, host.bookId, { cursor, sort: 'sort_order', limit: CHAPTER_PAGE_SIZE });
        items.push(...page.items);
        cursor = page.next_cursor;
        if (cursor && cursors.has(cursor)) throw new Error('Chapter pagination returned a repeated cursor');
        if (cursor) cursors.add(cursor);
      } while (cursor);
      return { items };
    },
    enabled: !!accessToken,
  });

  if (work.kind !== 'ready') return <QualityWorkGate state={work} testIdPrefix="quality-conformance" bookId={host.bookId} token={accessToken} />;

  const chapters = chaptersQ.data?.items ?? [];

  return (
    <div data-testid="studio-quality-conformance-panel" className="flex h-full min-h-0 flex-col gap-2 overflow-auto p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <select
          data-testid="quality-conformance-chapter-picker"
          aria-label={t('quality.pickChapter', { defaultValue: 'Pick a chapter' })}
          className="min-w-[10rem] rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
          value={chapterId}
          onChange={(e) => setSelection({ scope, chapterId: e.target.value })}
        >
          <option value="">{t('quality.pickChapter', { defaultValue: 'Pick a chapter' })}</option>
          {chapters.map((c) => (
            <option key={c.chapter_id} value={c.chapter_id}>
              {chapterDisplayTitle(c)}
            </option>
          ))}
        </select>
        <ModelPicker
          capability="chat"
          value={effectiveModelRef || null}
          onChange={(id) => setModelRef(id ?? '')}
          placeholder={t('quality.pickModelRerun', { defaultValue: 'Pick a model to re-run with…' })}
          compact
        />
      </div>
      {chaptersQ.isLoading && <p role='status'>{t('composition:motif.conf.chaptersLoading')}</p>}
      {chaptersQ.isError && <div role='alert'>{t('composition:motif.conf.chaptersError')} <button onClick={() => chaptersQ.refetch()}>{t('composition:motif.action.retry')}</button></div>}
      {chaptersQ.isSuccess && chapters.length === 0 && <p>{t('composition:motif.conf.noChapters')}</p>}
      {chapterId ? (
        <div className="min-h-0 flex-1">
          <ConformanceTraceView
            bookId={host.bookId}
            projectId={work.projectId}
            chapterId={chapterId}
            token={accessToken}
            modelRef={effectiveModelRef || null}
            modelSource={effectiveModel?.model_source === 'platform_model' ? 'platform_model' : 'user_model'}
            onOpenScene={(sceneId, chId) => {
              // §2#6 loop-connect — publish the selection + open the scene surface (the SceneBrowser pattern).
              if (sceneId) {
                host.publish({ type: 'scene', sceneId, chapterId: chId });
                host.openPanel('scene-inspector', { focus: true });
              } else {
                // empty state: no specific scene yet → land on the scene-browser to pick one to bind.
                host.publish({ type: 'chapter', chapterId: chId, bookId: host.bookId });
                host.openPanel('scene-browser', { focus: true });
              }
            }}
          />
        </div>
      ) : (
        <div data-testid="quality-conformance-no-chapter" className="p-4 text-center text-neutral-500">
          {t('quality.pickChapterConformanceHint', { defaultValue: 'Pick a chapter above to trace how its prose realized the plan.' })}
        </div>
      )}
    </div>
  );
}
