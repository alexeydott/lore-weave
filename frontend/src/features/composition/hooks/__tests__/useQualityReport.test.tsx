import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QualityReport } from '../../api';
import { useQualityReport } from '../useQualityReport';

// Restore contract (user regression 2026-11-10): the LATEST saved critic report must
// survive remount/reload — the server owns report history, not the panel.
const { getLatestQualityReport, pollQualityJob, qualityReport, cancelJob } = vi.hoisted(() => ({
  getLatestQualityReport: vi.fn(),
  pollQualityJob: vi.fn(),
  qualityReport: vi.fn(),
  cancelJob: vi.fn(),
}));
vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    compositionApi: { ...actual.compositionApi, getLatestQualityReport, qualityReport, cancelJob },
    pollQualityJob,
  };
});
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

const report = { scope: { complete: true, synthesis_completed: true, partial: false }, critic: { coherence: 4, voice_match: 5, pacing: 4, canon_consistency: 4, violations: [] }, threads: { raised: [], resolved: [], raised_count: 0, resolved_count: 0 } } as unknown as QualityReport;

type Ids = { projectId?: string | null; chapterId?: string | null; token?: string | null };
function render(id: Ids = {}) {
  const base: Required<Ids> = { projectId: 'p', chapterId: 'c', token: 't', ...id } as Required<Ids>;
  return renderHook((next?: Ids) => useQualityReport(
    next?.projectId ?? base.projectId, next?.chapterId ?? base.chapterId,
    next?.token ?? base.token, 'm', 'user_model',
  ));
}

beforeEach(() => {
  getLatestQualityReport.mockReset().mockResolvedValue({ job_id: 'j1', status: 'completed', created_at: '', updated_at: '', result: { report } });
  pollQualityJob.mockReset();
  qualityReport.mockReset();
  cancelJob.mockReset().mockResolvedValue({ job_id: 'j9', status: 'cancelled' });
});

describe('useQualityReport restore', () => {
  it('seeds the latest saved report on mount and marks it ran', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.report).toBe(report));
    expect(getLatestQualityReport).toHaveBeenCalledWith('p', 'c', 't');
    expect(result.current.ran).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(qualityReport).not.toHaveBeenCalled();
  });

  it('resumes polling when the saved job is still running', async () => {
    getLatestQualityReport.mockResolvedValue({ job_id: 'j2', status: 'running', created_at: '', updated_at: '', result: null });
    // Hold the poll open so the mid-restore loading state is observable.
    let release: (value: { report: QualityReport }) => void = () => {};
    pollQualityJob.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(true));
    await act(async () => { release({ report }); });
    await waitFor(() => expect(result.current.report).toBe(report));
    expect(result.current.loading).toBe(false);
    expect(pollQualityJob).toHaveBeenCalledWith('j2', 't', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(qualityReport).not.toHaveBeenCalled();
  });

  it('leaves the panel empty on 404 (nothing ran yet) without error', async () => {
    getLatestQualityReport.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));
    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.report).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.ran).toBe(false);
  });

  it('does not restore across an identity change (switched chapter keeps its own report)', async () => {
    const { result, rerender } = render({ chapterId: 'c1' });
    await waitFor(() => expect(result.current.report).toBe(report));
    getLatestQualityReport.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));
    rerender({ chapterId: 'c2' });
    await waitFor(() => expect(result.current.report).toBeNull());
    expect(result.current.ran).toBe(false);
  });

  it('a fresh run replaces the restored report', async () => {
    const fresh = { ...report, critic: { ...report.critic, coherence: 2 } } as QualityReport;
    qualityReport.mockResolvedValue({ job_id: 'j3', status: 'completed', report: fresh });
    const { result } = render();
    await waitFor(() => expect(result.current.report).toBe(report));
    await act(async () => { await result.current.run(); });
    expect(result.current.report).toBe(fresh);
    expect(qualityReport).toHaveBeenCalledWith('p', { chapterId: 'c', modelRef: 'm', modelSource: 'user_model' }, 't', expect.anything());
  });

  it('stop-waiting cancels the SERVER job, not just the local wait', async () => {
    // No saved report (404); the run's 202 carries the job id via onJobId while
    // the poll is still in flight.
    getLatestQualityReport.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));
    let finish: (value: { report: QualityReport }) => void = () => {};
    qualityReport.mockImplementation((_p: string, _b: unknown, _t: string, opts: { onJobId: (id: string) => void }) =>
      new Promise<{ report: QualityReport }>((resolve) => {
        opts.onJobId('j9');
        finish = () => resolve({ report });
      }));
    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Fire the run without awaiting: the mocked job stays in flight until cancel.
    act(() => { void result.current.run(); });
    await waitFor(() => expect(result.current.loading).toBe(true));
    await act(async () => { result.current.cancel(); });
    expect(cancelJob).toHaveBeenCalledWith('j9', 't');
    await act(async () => { finish({ report }); });
    expect(result.current.stopped).toBe(true);
  });

  it('restored running job is also cancellable by the user', async () => {
    getLatestQualityReport.mockResolvedValue({ job_id: 'j2', status: 'running', created_at: '', updated_at: '', result: null });
    let release: (value: { report: QualityReport }) => void = () => {};
    pollQualityJob.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(true));
    await act(async () => { result.current.cancel(); });
    expect(cancelJob).toHaveBeenCalledWith('j2', 't');
    await act(async () => { release({ report }); });
    expect(result.current.stopped).toBe(true);
  });
});
