import { useTranslation } from 'react-i18next';
import { ModelPicker } from '@/components/model-picker';
import type { OutlineNode } from '@/features/composition/types';
import type { RosterOption } from '@/features/composition/hooks/useGlossaryRoster';
import type { PlanOverlayRef } from '../types';
import { referenceSources, type EntityReference } from '../referenceShelfApi';
import { useReferenceShelf } from '../hooks/useReferenceShelf';

interface Props {
  bookId: string;
  node: OutlineNode;
  token: string | null;
  roster: RosterOption[];
  onOpenRef?: (ref: PlanOverlayRef, nodeId: string) => void;
  onSelectReferenceNode?: (nodeId: string) => void;
}
function ReferenceRow({ item, nodeId, onOpenRef, onSelectReferenceNode }: { item: EntityReference; nodeId: string; onOpenRef?: Props['onOpenRef']; onSelectReferenceNode?: Props['onSelectReferenceNode'] }) {
  const { t } = useTranslation('studio');
  const authoredDetail = item.source === 'canon_rule' || item.source === 'narrative_thread';
  const label = item.node_ref.title || (authoredDetail ? item.detail : '') || t(`referenceShelf.groups.${item.source}`);
  // Only narrative_thread ids match the existing drawer's thread-focus contract.
  // Outline ids are NOT manuscript chapter ids; canon and application ids have no focus resolver.
  return <li className="break-words text-xs">
    {item.node_ref.kind === 'narrative_thread' && onOpenRef
      ? <button type="button" className="text-primary underline" onClick={() => onOpenRef({ kind: 'thread', id: item.node_ref.id, line: label }, nodeId)}>{label}</button>
      : ['outline_pov', 'outline_present', 'scene_pov', 'scene_present'].includes(item.source) && onSelectReferenceNode
        ? <button type="button" className="text-primary underline" onClick={() => onSelectReferenceNode(item.node_ref.id)}>{label}</button>
        : <span>{label}</span>}
    {authoredDetail && item.node_ref.title && item.detail && <p className="text-muted-foreground">{item.detail}</p>}
  </li>;
}
export function ReferenceShelf({ bookId, node, token, roster, onOpenRef, onSelectReferenceNode }: Props) {
  const { t, i18n } = useTranslation('studio');
  const shelf = useReferenceShelf(bookId, node, roster, token);
  const data = shelf.sources.data;
  return <section data-testid="plan-drawer-section-references" className="space-y-2 border-b p-3">
    <h3 className="text-[11px] font-semibold uppercase">{t('referenceShelf.title')}</h3>
    <p className="text-xs text-muted-foreground">{t('referenceShelf.planOnly')}</p>
    <label className="block text-xs">{t('referenceShelf.entity')}
      <select className="w-full rounded border bg-background p-1" value={shelf.entityId} onChange={e => shelf.selectEntity(e.target.value)} disabled={!token || !shelf.options.length}>
        {!shelf.options.length && <option value="">{t('referenceShelf.chooseEntity')}</option>}
        {shelf.options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
    {!token ? <p>{t('referenceShelf.signIn')}</p> : !shelf.options.length ? <p>{t('referenceShelf.noEntities')}</p> : <>
      {shelf.sources.isFetching && <p role="status">{t('referenceShelf.loading')}</p>}
      {shelf.sources.isError && <p role="alert">{t('referenceShelf.loadFailed')}</p>}
      {data && referenceSources.map(source => {
        const group = data.sources[source];
        return <div key={source} data-testid={`reference-source-${source}`}>
          <h4 className="text-xs font-medium">{t(`referenceShelf.groups.${source}`)}{group && !('error' in group) ? ` (${group.count})` : ''}</h4>
          {source === 'narrative_thread' && <p className="text-[11px] text-muted-foreground">{t('referenceShelf.indirectThreads')}</p>}
          {!group || 'error' in group ? <p role="alert" className="text-xs text-destructive">{t('referenceShelf.partial')}</p> : <>
            {group.count === 0 && <p className="text-xs text-muted-foreground">{t('referenceShelf.empty')}</p>}
            <ul className="space-y-1">{group.refs.map((item, index) => <ReferenceRow key={`${item.node_ref.id}:${index}`} item={item} nodeId={node.id} onOpenRef={onOpenRef} onSelectReferenceNode={onSelectReferenceNode} />)}</ul>
            {(group.has_more || group.count > group.refs.length) && <p className="text-xs">{t('referenceShelf.capped', { shown: group.refs.length, count: group.count })}</p>}
          </>}
        </div>;
      })}
      {data && Object.values(data.sources).some(group => group && !('error' in group) && (group.has_more || group.count > group.refs.length)) && (shelf.limit < 100
        ? <button type="button" className="text-xs underline" disabled={shelf.sources.isFetching} onClick={shelf.showMore}>{t('referenceShelf.showMore')}</button>
        : <p className="text-xs">{t('referenceShelf.limitReached')}</p>)}
      {(shelf.sources.isError || data && Object.values(data.sources).some(group => group && 'error' in group)) && <button type="button" className="text-xs underline" disabled={shelf.sources.isFetching} onClick={() => void shelf.sources.refetch()}>{t('referenceShelf.retry')}</button>}
      <ReferenceHelper shelf={shelf} nodeId={node.id} onOpenRef={onOpenRef} onSelectReferenceNode={onSelectReferenceNode} locale={i18n.language} />
    </>}
  </section>;
}
function ReferenceHelper({ shelf, nodeId, onOpenRef, onSelectReferenceNode, locale }: { shelf: ReturnType<typeof useReferenceShelf>; nodeId: string; onOpenRef?: Props['onOpenRef']; onSelectReferenceNode?: Props['onSelectReferenceNode']; locale: string }) {
  const { t } = useTranslation('studio');
  return <div className="space-y-2 border-t pt-2">
    <p className="text-xs text-muted-foreground">{t('referenceShelf.paid')}</p>
    <ModelPicker capability="chat" compact value={shelf.modelRef || null} onChange={shelf.setModel} ariaLabel={t('referenceShelf.model')} placeholder={t('referenceShelf.model')} />
    {!shelf.modelRef && <p className="text-[11px]">{t('referenceShelf.inheritedModel')}</p>}
    <label className="block text-xs">{t('referenceShelf.question')}
      <textarea className="w-full rounded border bg-background p-1" value={shelf.question} maxLength={2000} onChange={e => shelf.setQuestion(e.target.value)} placeholder={t('referenceShelf.questionPlaceholder')} />
    </label>
    <div className="flex flex-wrap gap-1">{(['consistency', 'summary', 'gaps'] as const).map(prompt => <button key={prompt} type="button" className="rounded border p-1 text-xs" onClick={() => shelf.setQuestion(t(`referenceShelf.prompts.${prompt}`))}>{t(`referenceShelf.prompts.${prompt}`)}</button>)}</div>
    <button type="button" className="rounded border p-1 text-xs" disabled={shelf.busy || !shelf.question.trim()} onClick={() => void shelf.ask(locale)}>{t(shelf.busy ? 'referenceShelf.asking' : 'referenceShelf.ask')}</button>
    {shelf.assistantError && <p role="alert">{t('referenceShelf.assistantFailed')}</p>}
    {shelf.answer && <div data-testid="reference-answer" className="space-y-2 text-xs">
      <p className="whitespace-pre-wrap">{shelf.answer.answer}</p>
      <ul>{shelf.answer.citations.map((citation, index) => <ReferenceRow key={`${citation.citation_id}:${index}`} item={citation} nodeId={nodeId} onOpenRef={onOpenRef} onSelectReferenceNode={onSelectReferenceNode} />)}</ul>
    </div>}
  </div>;
}
