import { useTranslation } from 'react-i18next';
import { FormDialog } from '@/components/shared/FormDialog';
import { useSceneMotifEditor, useSceneMotifSession } from '../hooks/useSceneMotifEditor';
import type { SceneMotifEditorProps as Props } from '../hooks/useSceneMotifEditor';

export function SceneMotifEditor(props: Props) {
  const { visible, onSessionChange } = useSceneMotifSession(props);
  return <ScopedEditor key={JSON.stringify([visible.projectId, visible.bookId, visible.chapterId, visible.sceneId, visible.token])} {...visible} onSessionChange={onSessionChange} />;
}
function ScopedEditor(props: Props & { onSessionChange: (open: boolean) => void }) {
  const { sceneId, sceneTitle } = props;
  const { t } = useTranslation('composition');
  const identity = sceneTitle?.trim() || `${t('untitledScene')} · ${props.chapterId}`;
  const { editor, bindings, roster, candidates, a, selected, close, open, search, setSearch, confirm, setConfirm } = useSceneMotifEditor(props, props.onSessionChange);
  return <>
    <button type="button" data-testid={`scene-motif-editor-open-${sceneId}`} disabled={!bindings.isSuccess} onClick={open}>{t('motif.editor.open')}</button>
    {bindings.isError && <p role="alert">{t('motif.editor.loadError')} <button onClick={() => bindings.refetch()}>{t('motif.action.retry')}</button></p>}
    <FormDialog open={!!a} onOpenChange={(open) => { if (!open) close(); }} title={`${t('motif.editor.title')} — ${identity}`} description={t('motif.editor.description')} size="2xl" footer={<>
      <button disabled={a?.pending} onClick={close}>{t('motif.editor.cancel')}</button>
      <button disabled={!editor.dirty || a?.pending || !candidates.isSuccess} onClick={() => void editor.save()}>{t(a?.pending ? 'motif.editor.saving' : 'motif.editor.save')}</button>
    </>}>
      {a && <div className="space-y-4">
        <p>{t('motif.editor.current')}: {bindings.data?.bindings[sceneId]?.motif_name || t('motif.editor.freeform')}</p>
        {editor.dirty && <p role="status">{t('motif.editor.dirty')}</p>}
        {candidates.isSuccess && candidates.data.length === 0 && <p>{t('motif.binding.candidatesEmpty')}</p>}
        {candidates.isLoading && <p role="status">{t('motif.binding.candidatesLoading')}</p>}
        {candidates.isError && <p role="alert">{t('motif.editor.loadError')} <button onClick={() => candidates.refetch()}>{t('motif.action.retry')}</button></p>}
        <label className="block">{t('motif.editor.search')}<input className="block w-full rounded border p-2" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <label className="block">{t('motif.editor.motif')}<select className="block w-full rounded border p-2" disabled={a.pending} value={a.draft.motifId ?? ''} onChange={(e) => {
          const motif = candidates.data?.find((m) => m.id === e.target.value);
          editor.update({ motifId: e.target.value || null, roles: Object.fromEntries((motif?.roles ?? []).map((r) => [r.key, null])) });
        }}>
          <option value="">{t('motif.editor.freeform')}</option>
          {a.draft.motifId && !selected && <option value={a.draft.motifId}>{bindings.data?.bindings[sceneId]?.motif_name || a.draft.motifId}</option>}
          {(candidates.data ?? []).filter((m) => m.id === a.draft.motifId || `${m.name} ${m.code}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map((m) => <option key={m.id} value={m.id}>{m.name} — {m.code}</option>)}
        </select></label>
        {selected && <section aria-label={t('motif.editor.preview')} className="space-y-2 break-words"><h3>{selected.name}</h3><p>{selected.summary}</p>
          {selected.text_fallback && <p>{t('motif.editor.fallback', { language: selected.text_language || selected.original_language })}</p>}
          <ol>{selected.beats.map((b) => <li key={b.key}>{b.label}</li>)}</ol>
          {selected.roles.map((r) => <label className="block" key={r.key}>{r.label}<select className="block w-full rounded border p-2" disabled={a.pending || roster.isError || roster.isLoading} value={a.draft.roles[r.key] ?? ''} onChange={(e) => editor.update({ ...a.draft, roles: { ...a.draft.roles, [r.key]: e.target.value || null } })}><option value="">{t('motif.editor.unresolved')}</option>{roster.data?.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select></label>)}
        </section>}
        {roster.isError && <p role="alert">{t('motif.editor.loadError')} <button onClick={() => roster.refetch()}>{t('motif.action.retry')}</button></p>}
        {a.error && <p role="alert">{t(a.partial ? 'motif.editor.partialError' : 'motif.editor.saveError')}</p>}
      </div>}
    </FormDialog>
    <FormDialog open={confirm} onOpenChange={setConfirm} title={t('motif.editor.discardTitle')} description={t('motif.editor.discardDescription')} footer={<><button onClick={() => setConfirm(false)}>{t('motif.editor.stay')}</button><button onClick={() => { setConfirm(false); editor.close(); }}>{t('motif.editor.discard')}</button></>}>{null}</FormDialog>
  </>;
}
