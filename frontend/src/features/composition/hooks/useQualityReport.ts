// LOOM Composition · Q1+Q2 Quality Report (controller) — owns the read-only report state.
//
// Runs the two advisory judges (4-dim critic + promise audit) for the open chapter and holds
// the resulting report. This is DIAGNOSTIC: unlike the self-heal proposals there is no
// acceptance set and no apply — the author reads it and decides. The view only renders + calls run.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { compositionApi, type QualityReport, type QualityProgress } from '../api';

export function useQualityReport(
  projectId: string | null,
  chapterId: string | null,
  token: string | null,
  modelRef: string,
  modelSource: 'user_model' | 'platform_model' = 'user_model',
) {
  const { t } = useTranslation('composition');
  const [report, setReport] = useState<QualityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ran, setRan] = useState(false);

  const [stopped, setStopped] = useState(false);
  const [progress, setProgress] = useState<QualityProgress | null>(null);
  const request = useRef<AbortController | null>(null);
  const identity = JSON.stringify([projectId, chapterId, modelSource, modelRef, token]);
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const [resultIdentity, setResultIdentity] = useState(identity);
  useEffect(() => {
    request.current?.abort();
    request.current = null;
    setStopped(false);
    setReport(null);
    setLoading(false);
    setError(null);
    setRan(false);
    setProgress(null);
    setResultIdentity(identity);
    return () => { request.current?.abort(); };
  }, [identity]);

  const cancel = useCallback(() => {
    request.current?.abort();
    request.current = null;
    setLoading(false);
    setProgress(null);
    setStopped(true);
  }, []);

  const run = useCallback(async () => {
    if (!projectId || !chapterId || !token || !modelRef) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const active = () => request.current === controller && !controller.signal.aborted && currentIdentity.current === identity;
    setResultIdentity(identity);
    setStopped(false);
    setReport(null);
    setProgress(null);
    setLoading(true);
    setError(null);
    try {
      const r = await compositionApi.qualityReport(projectId, { chapterId, modelRef, modelSource }, token, { signal: controller.signal, onProgress: (value) => { if (active()) setProgress(value); } });
      if (!active()) return;
      setReport(r.report ?? null);
      setRan(true);
    } catch {
      if (!active()) return;
      setError(t('qualityCriticNa', { defaultValue: 'Critic unavailable.' }));
    } finally {
      if (active()) setLoading(false);
    }
  }, [projectId, chapterId, token, modelRef, modelSource, identity, t]);

  return { report: resultIdentity === identity ? report : null, loading: resultIdentity === identity && loading, error: resultIdentity === identity ? error : null, ran: resultIdentity === identity && ran, stopped: resultIdentity === identity && stopped, progress: resultIdentity === identity ? progress : null, run, cancel };
}
