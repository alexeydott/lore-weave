// D-MOTIF-FE-PLANNERVIEW-WIRING (Shape A) — fetch the POST-commit per-scene motif
// bindings for a committed chapter ({ node_id: SceneBoundMotif | null }). The planner
// renders MotifBindingCard per committed scene from this map. Query is gated on a
// chapterId (disabled until a chapter is committed) + the token. No JSX.
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { compositionApi } from '../../api';
import type { MotifBindingsResponse } from '../types';

export function useMotifBindings(projectId: string, chapterId: string | null, token: string | null) {
  const { i18n } = useTranslation();
  return useQuery<MotifBindingsResponse>({
    queryKey: ['composition', 'motif-bindings', projectId, chapterId, token, i18n.language],
    queryFn: () => compositionApi.getMotifBindings(projectId, chapterId!, token!, i18n.language),
    enabled: !!projectId && !!chapterId && !!token,
    staleTime: 30_000,
  });
}
