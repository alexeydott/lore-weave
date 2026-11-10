// Book-scoped diagnostic coverage; stale requests must never cross Work/auth boundaries.
import { useCallback, useEffect, useRef, useState } from 'react';

import { compositionApi, type PromiseCoverage } from '../api';

export function useBookPromiseCoverage(
  projectId: string | null,
  token: string | null,
  modelRef: string,
  modelSource: 'user_model' | 'platform_model' = 'user_model',
) {
  const [coverage, setCoverage] = useState<PromiseCoverage | null>(null);
  const [chapters, setChapters] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ran, setRan] = useState(false);
  const scope = `${projectId}\0${token}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const request = useRef(0);
  useEffect(() => {
    request.current += 1;
    setCoverage(null);
    setChapters(null);
    setLoading(false);
    setError(null);
    setRan(false);
    return () => { request.current += 1; };
  }, [scope]);

  const run = useCallback(async () => {
    if (!projectId || !token || !modelRef) return;
    const id = ++request.current;
    const current = () => scopeRef.current === scope && request.current === id;
    setLoading(true);
    setError(null);
    try {
      const r = await compositionApi.promiseCoverage(projectId, { modelRef, modelSource }, token);
      if (!current()) return;
      setCoverage(r.coverage ?? null);
      setChapters(r.chapters ?? null);
      setRan(true);
    } catch (e) {
      if (current()) setError((e as Error).message || 'Promise coverage failed');
    } finally {
      if (current()) setLoading(false);
    }
  }, [projectId, token, modelRef, modelSource, scope]);

  return { coverage, chapters, loading, error, ran, run };
}
