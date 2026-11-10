import { useEffect, useRef, useState } from 'react';
import { useSceneMotifCandidates } from './useSceneMotifCandidates';
import { useMotifBindings } from './useMotifBindings';
import { useSceneMotifDraft } from './useSceneMotifDraft';
import { useGlossaryRoster } from '../../hooks/useGlossaryRoster';
export type SceneMotifEditorProps = { projectId: string; bookId: string; chapterId: string; sceneId: string; token: string | null; request?: { id: number; motifId?: string }; sceneTitle?: string };
export function useSceneMotifSession(props: SceneMotifEditorProps) {
  const [session, setSession] = useState<SceneMotifEditorProps | null>(null);
  // An open draft remains attached to its original scene if selection changes.
  // Authentication changes are different: immediately remove the old user's draft.
  const retained = session?.token === props.token ? session : null;
  const visible = retained ?? props;
  return { visible, onSessionChange: (open: boolean) => setSession(open ? visible : null) };
}
export function useSceneMotifEditor({ projectId, bookId, chapterId, sceneId, token, request }: SceneMotifEditorProps, onSessionChange: (open: boolean) => void) {
  const editor = useSceneMotifDraft(projectId, chapterId, sceneId, token, bookId);
  const bindings = useMotifBindings(projectId, chapterId, token);
  const roster = useGlossaryRoster(bookId, token);
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState(false);
  const candidates = useSceneMotifCandidates(token, !!editor.active || !!request);
  const handled = useRef<number>();
  useEffect(() => {
    if (!editor.active && request && handled.current !== request.id && bindings.isSuccess && (!request.motifId || candidates.isSuccess)) {
      handled.current = request.id;
      editor.begin(bindings.data?.bindings[sceneId] ?? null, request.motifId ? { motifId: request.motifId, roles: Object.fromEntries((candidates.data?.find((m) => m.id === request.motifId)?.roles ?? []).map((r) => [r.key, null])) } : undefined);
    }
  }, [request, bindings.isSuccess, candidates.isSuccess]);
  const a = editor.active;
  const reportSession = useRef(onSessionChange); reportSession.current = onSessionChange;
  useEffect(() => { reportSession.current(!!a); }, [!!a]);
  const selected = candidates.data?.find((m) => m.id === a?.draft.motifId);
  const open = () => editor.begin(bindings.data?.bindings[sceneId] ?? null);
  const close = () => { if (a?.pending) return; if (editor.dirty) setConfirm(true); else editor.close(); };
  return { editor, bindings, roster, candidates, a, selected, close, open, search, setSearch, confirm, setConfirm };
}
