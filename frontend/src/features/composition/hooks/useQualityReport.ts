// LOOM Composition · Q1+Q2 Quality Report (controller) — owns the read-only report state.
//
// Runs the two advisory judges (4-dim critic + promise audit) for the open chapter and holds
// the resulting report. This is DIAGNOSTIC: unlike the self-heal proposals there is no
// acceptance set and no apply — the author reads it and decides. The view only renders + calls run.
//
// The LATEST saved report is restored from the server on mount/identity change (user report
// 2026-11-10: critic results must survive reload/panel switches). A still-running job resumes
// polling with progress; a completed (even partial) job seeds the report immediately. Restore
// failures never block a fresh run — they are silent, the panel just starts empty.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { compositionApi, pollQualityJob, type QualityReport, type QualityProgress } from '../api';

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
  // The server job behind the current wait — "stop waiting" must stop the SPEND,
  // not just this component's polling (user report 2026-11-10).
  const activeJobId = useRef<string | null>(null);
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
    if (!projectId || !chapterId || !token) return () => { request.current?.abort(); };
    const controller = new AbortController();
    request.current = controller;
    const active = () => request.current === controller && !controller.signal.aborted && currentIdentity.current === identity;
    // Restore the latest saved job for this chapter: completed seeds the report,
    // running resumes the wait, missing (404) leaves the panel empty.
    void (async () => {
      try {
        const saved = await compositionApi.getLatestQualityReport(projectId, chapterId, token);
        if (!active()) return;
        if (saved.status === 'pending' || saved.status === 'running') {
          activeJobId.current = saved.job_id;
          setLoading(true);
          const r = await pollQualityJob(saved.job_id, token, {
            signal: controller.signal,
            onProgress: (value) => { if (active()) setProgress(value); },
          });
          if (!active()) return;
          activeJobId.current = null;
          setReport(r.report ?? null);
          setRan(true);
          setLoading(false);
        } else if (saved.result?.report) {
          setReport(saved.result.report);
          setRan(true);
        }
      } catch {
        // Restore is best-effort: a failed/aborted read leaves the panel empty
        // (the author can always run a fresh analysis). Never blocks the run button.
        if (active()) setLoading(false);
      }
    })();
    return () => { request.current?.abort(); };
  }, [identity, projectId, chapterId, token]);

  const cancel = useCallback(() => {
    request.current?.abort();
    request.current = null;
    const jobId = activeJobId.current;
    activeJobId.current = null;
    setLoading(false);
    setProgress(null);
    setStopped(true);
    // "Stop waiting" is a real cancel: the worker aborts the in-flight call
    // (bug #34 cancel_check) instead of billing a result nobody will read.
    if (jobId && token) void compositionApi.cancelJob(jobId, token).catch(() => {});
  }, [token]);

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
      const r = await compositionApi.qualityReport(projectId, { chapterId, modelRef, modelSource }, token, {
        signal: controller.signal,
        onProgress: (value) => { if (active()) setProgress(value); },
        onJobId: (jobId) => { if (active()) activeJobId.current = jobId; },
      });
      if (!active()) return;
      activeJobId.current = null;
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
