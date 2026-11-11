import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { compositionApi, type QualityRunModel, type QualityRunEstimate } from '@/features/composition/api';

export type QualityActionStage = 'estimate' | 'start' | 'stop';
export type QualityActionError = { stage: QualityActionStage; code: 'REQUEST_TIMEOUT' | 'HTTP_ERROR' | 'TRANSPORT_ERROR' | 'UNKNOWN'; status?: number; cause: unknown };
/** Keep diagnostic metadata, never render private backend messages or arbitrary codes. */
export function qualityActionError(stage: QualityActionStage, cause: unknown): QualityActionError {
  const value = cause && typeof cause === 'object' ? cause as { code?: unknown; status?: unknown } : null;
  const status = typeof value?.status === 'number' ? value.status : undefined;
  return { stage, code: value?.code === 'REQUEST_TIMEOUT' ? 'REQUEST_TIMEOUT' : status ? 'HTTP_ERROR' : cause instanceof TypeError ? 'TRANSPORT_ERROR' : 'UNKNOWN', status, cause };
}

/** Server owns execution. Mount/reattach only reads; leaving never cancels a run. */
export function useQualityBookRun(projectId: string | null, bookId: string, token: string | null | undefined, model: QualityRunModel | null) {
  const client = useQueryClient();
  const key = ['quality-book-run', token, bookId, projectId, model?.model_source, model?.model_ref];
  const [busyScope, setBusyScope] = useState<{ scope: string; stage: QualityActionStage } | null>(null);
  const [error, setError] = useState<{ scope: string; value: QualityActionError } | null>(null);
  const lock = useRef(false);
  const scope = JSON.stringify(key);
  const estimateKey = [...key, 'estimate'] as const;
  const estimateQuery = useQuery<{ value: QualityRunEstimate; idempotencyKey: string; createdAt: number } | null>({
    queryKey: estimateKey,
    queryFn: async () => client.getQueryData<{ value: QualityRunEstimate; idempotencyKey: string; createdAt: number } | null>(estimateKey) ?? null,
    enabled: false,
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    initialData: () => client.getQueryData<{ value: QualityRunEstimate; idempotencyKey: string; createdAt: number } | null>(estimateKey) ?? null,
  });
  const query = useQuery({
    queryKey: key,
    enabled: !!projectId && !!token && !!model?.model_ref,
    staleTime: 0,
    // Recover transient history failures using only bounded, read-only requests.
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    queryFn: async ({ signal }) => {
      const { runs } = await compositionApi.listQualityRuns(projectId!, model!, token!, signal);
      const matching = runs.filter((run) => run.book_id === bookId && run.project_id === projectId && run.model_source === model!.model_source && run.model_ref === model!.model_ref);
      return matching.find((run) => run.status === 'pending' || run.status === 'running') ?? matching[0] ?? null;
    },
    refetchInterval: (q) => q.state.data && ['pending', 'running'].includes(q.state.data.status) ? 2000 : false,
  });
  const action = async (stage: QualityActionStage, fn: () => Promise<void>) => {
    if (lock.current || !projectId || !token || !model) return;
    lock.current = true;
    setBusyScope({ scope, stage });
    setError(null);
    try { await fn(); } catch (cause) { setError({ scope, value: qualityActionError(stage, cause) }); }
    finally { lock.current = false; setBusyScope(null); }
  };
  return {
    run: query.data,
    loading: query.isLoading,
    error: error?.scope === scope ? error.value : null,
    historyError: query.isError,
    historyRefreshing: query.isFetching,
    retryHistory: () => query.refetch(),
    busy: busyScope?.scope === scope,
    stage: busyScope?.scope === scope ? busyScope.stage : null,
    estimate: estimateQuery.data && Date.now() - estimateQuery.data.createdAt < 5 * 60_000 ? estimateQuery.data.value : null,
    prepare: () => action('estimate', async () => {
      const value = await compositionApi.estimateQualityRun(projectId!, model!, token!);
      // Persist the visible confirmation and retry key in query cache, not component state.
      client.setQueryData(estimateKey, { value, idempotencyKey: crypto.randomUUID(), createdAt: Date.now() });
      await client.invalidateQueries({ queryKey: estimateKey, exact: true });
    }),
    confirm: () => action('start', async () => {
      const estimate = estimateQuery.data;
      if (!estimate || Date.now() - estimate.createdAt >= 5 * 60_000) return;
      const run = await compositionApi.startQualityRun(projectId!, { ...model!, idempotency_key: estimate.idempotencyKey, max_estimated_calls: estimate.value.estimated_calls_max, max_estimated_usd: estimate.value.estimated_usd_max }, token!);
      client.setQueryData(key, run);
      client.removeQueries({ queryKey: estimateKey, exact: true });
    }),
    stop: () => action('stop', async () => {
      if (!query.data) return;
      const run = await compositionApi.stopQualityRun(projectId!, query.data.id, token!);
      client.setQueryData(key, run);
    }),
  };
}
