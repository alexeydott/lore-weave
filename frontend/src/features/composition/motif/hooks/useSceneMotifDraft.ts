import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motifApi } from '../api';
import { compositionApi } from '../../api';
import type { SceneBoundMotif } from '../types';

type Draft = { motifId: string | null; roles: Record<string, string | null> };
export function useSceneMotifDraft(projectId: string, chapterId: string, sceneId: string, token: string | null, bookId = '') {
  const qc = useQueryClient();
  const scope = JSON.stringify([projectId, chapterId, sceneId, token, bookId]);
  const current = useRef(scope); current.current = scope;
  const mounted = useRef(true);
  const pending = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [state, setState] = useState<{ scope: string; baseline: Draft; draft: Draft; pending: boolean; error: boolean; partial: boolean } | null>(null);
  const active = state?.scope === scope ? state : null;
  const invalidate = () => Promise.allSettled(['motif-bindings', 'conformance', 'outline', 'decompose'].map((key) => qc.invalidateQueries({ queryKey: ['composition', key, projectId] })));
  const begin = (bound: SceneBoundMotif | null, proposal?: Draft) => {
    const draft = { motifId: bound?.motif_id ?? null, roles: Object.fromEntries(Object.entries(bound?.role_bindings ?? {}).map(([k, v]) => [k, v.entity_id])) };
    setState({ scope, baseline: draft, draft: proposal ?? draft, pending: false, error: false, partial: false });
  };
  const update = (draft: Draft) => setState((s) => s?.scope === scope && !s.pending ? { ...s, draft } : s);
  const close = () => { if (!pending.current) setState(null); };
  const save = async () => {
    if (!active || pending.current || !token) return false;
    pending.current = true;
    const live = () => mounted.current && current.current === scope;
    let baseline = { ...active.baseline, roles: { ...active.baseline.roles } };
    let changed = false;
    setState({ ...active, pending: true, error: false });
    try {
      if (baseline.motifId !== active.draft.motifId) {
        await motifApi.saveSceneMotif(projectId, sceneId, active.draft.motifId, token);
        baseline = { motifId: active.draft.motifId, roles: {} }; changed = true;
      }
      if (baseline.motifId) for (const [role_key, entity_id] of Object.entries(active.draft.roles)) {
        if (!live()) return false;
        // Newly bound motifs auto-resolve roles; explicitly apply every draft role,
        // including null. Successful writes advance the retry checkpoint individually.
        if (Object.hasOwn(baseline.roles, role_key) && baseline.roles[role_key] === entity_id) continue;
        await motifApi.saveSceneRole(projectId, sceneId, role_key, entity_id, token);
        baseline.roles[role_key] = entity_id; changed = true;
      }
      await invalidate();
      if (live()) setState(null);
      return true;
    } catch {
      // Keep confirmed operation checkpoints. Unknown/failed role operations remain
      // retryable (role PATCH is idempotent); never replay a successful motif swap.
      if (changed) {
        try {
          const persisted = await compositionApi.getMotifBindings(projectId, chapterId, token);
          const bound = persisted.bindings[sceneId];
          baseline = { motifId: bound?.motif_id ?? null, roles: Object.fromEntries(Object.entries(bound?.role_bindings ?? {}).map(([key, value]) => [key, value.entity_id])) };
        } catch { /* Confirmed operation checkpoints remain retryable if refresh fails. */ }
        await invalidate();
      }
      if (live()) setState({ ...active, baseline, pending: false, error: true, partial: changed || active.partial });
      return false;
    } finally { pending.current = false; }
  };
  return { active, begin, update, close, save, dirty: !!active && JSON.stringify(active.baseline) !== JSON.stringify(active.draft) };
}
