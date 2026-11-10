// Chapter trace and scope-bound mint → confirm flow. No JSX.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { motifApi } from '../api';
import type { CostEstimate } from '../types';

export function useConformanceTrace(
  projectId: string | undefined, chapterId: string | undefined, token: string | null,
  modelRef?: string | null, modelSource: 'user_model' | 'platform_model' = 'user_model',
) {
  const qc = useQueryClient();
  const scope = JSON.stringify([projectId, chapterId, token, modelSource, modelRef]);
  const current = useRef({ scope, generation: 0 });
  if (current.current.scope !== scope) current.current = { scope, generation: current.current.generation + 1 };
  const generation = current.current.generation;
  const request = useRef(0);
  const confirming = useRef(false);
  const [proposal, setProposal] = useState<{ generation: number; estimate: CostEstimate } | null>(null);
  const estimate = proposal?.generation === generation ? proposal.estimate : null;
  const key = ['composition', 'conformance', projectId, chapterId, token];
  const ready = !!projectId && !!chapterId && !!token;
  const canRerun = ready && !!modelRef;
  const query = useQuery({
    queryKey: key,
    queryFn: () => motifApi.conformance(projectId!, chapterId!, token!),
    enabled: ready,
  });
  const regenerateScene = useMutation({
    mutationFn: (outlineNodeId: string) => {
      if (!canRerun || current.current.generation !== generation) throw new Error('Regenerate needs a chapter and model');
      return motifApi.regenerateScene(projectId!, outlineNodeId, modelRef!, token!, modelSource);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  const mintRun = useMutation({
    mutationFn: async () => {
      if (!canRerun || current.current.generation !== generation) throw new Error('Re-run needs a chapter and model');
      const id = ++request.current;
      const result = await motifApi.chapterConformanceRunPropose(
        { projectId: projectId!, chapterId: chapterId!, modelRef: modelRef!, modelSource }, token!);
      if (current.current.generation === generation && request.current === id) {
        setProposal({ generation, estimate: result });
      }
    },
  });
  const confirmRun = useMutation({
    mutationFn: async () => {
      if (!estimate || confirming.current || current.current.generation !== generation) throw new Error('No current conformance estimate');
      confirming.current = true;
      try {
        await motifApi.chapterConformanceRunConfirm(estimate.confirm_token, token!);
        await qc.invalidateQueries({ queryKey: key });
        if (current.current.generation === generation) setProposal(null);
      } finally { confirming.current = false; }
    },
  });
  const cancelRun = () => { request.current += 1; setProposal(null); };
  return {
    conformance: ready ? query.data ?? null : null,
    isLoading: ready && query.isLoading,
    isError: ready && query.isError,
    refetch: query.refetch,
    actionError: [mintRun, confirmRun, regenerateScene].some((m) => m.isError),
    regenerateScene, estimate, mintRun, confirmRun, cancelRun, canRerun,
  };
}
