import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { compositionApi, type QualityRunModel, type QualityRunEstimate } from '@/features/composition/api';

/** Server owns execution. Mount/reattach only reads; leaving never cancels a run. */
export function useQualityBookRun(projectId: string | null, bookId: string, token: string | null | undefined, model: QualityRunModel | null) {
  const client = useQueryClient();
  const key = ['quality-book-run', token, bookId, projectId, model?.model_source, model?.model_ref];
  const [estimate, setEstimate] = useState<{ scope: string; value: QualityRunEstimate; idempotencyKey: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const scope = JSON.stringify(key);
  const query = useQuery({
    queryKey: key,
    enabled: !!projectId && !!token && !!model?.model_ref,
    staleTime: 0,
    queryFn: async ({ signal }) => {
      const { runs } = await compositionApi.listQualityRuns(projectId!, model!, token!, signal);
      const matching = runs.filter((run) => run.book_id === bookId && run.project_id === projectId && run.model_source === model!.model_source && run.model_ref === model!.model_ref);
      return matching.find((run) => run.status === 'pending' || run.status === 'running') ?? matching[0] ?? null;
    },
    refetchInterval: (q) => q.state.data && ['pending', 'running'].includes(q.state.data.status) ? 2000 : false,
  });
  const action = async (fn: () => Promise<void>) => {
    if (lock.current || !projectId || !token || !model) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try { await fn(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'unknown'); }
    finally { lock.current = false; setBusy(false); }
  };
  return {
    run: query.data,
    loading: query.isLoading,
    error: error ?? (query.isError ? 'unknown' : null),
    busy,
    estimate: estimate?.scope === scope ? estimate.value : null,
    prepare: () => action(async () => {
      const value = await compositionApi.estimateQualityRun(projectId!, model!, token!);
      // One explicit estimate/confirmation intent keeps its key across ambiguous retries.
      setEstimate({ scope, value, idempotencyKey: crypto.randomUUID() });
    }),
    confirm: () => action(async () => {
      if (estimate?.scope !== scope) return;
      const run = await compositionApi.startQualityRun(projectId!, { ...model!, idempotency_key: estimate.idempotencyKey, max_estimated_calls: estimate.value.estimated_calls_max, max_estimated_usd: estimate.value.estimated_usd_max }, token!);
      client.setQueryData(key, run);
      setEstimate(null);
    }),
    stop: () => action(async () => {
      if (!query.data) return;
      const run = await compositionApi.stopQualityRun(projectId!, query.data.id, token!);
      client.setQueryData(key, run);
    }),
  };
}
