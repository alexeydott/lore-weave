import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compositionApi, isQualityComplete } from '../api';
import { useQualityReport } from '../hooks/useQualityReport';

const transport = vi.hoisted(() => vi.fn());
vi.mock('../../../api', () => ({ apiBase: () => '', apiJson: (...args: unknown[]) => transport(...args) }));
afterEach(() => { vi.restoreAllMocks(); transport.mockReset(); });
const report = { scope: { partial: false, complete: true, synthesis_completed: true }, critic: { coherence: 4, voice_match: 4, pacing: 4, canon_consistency: 4, violations: [] }, threads: { raised: [], resolved: [], raised_count: 0, resolved_count: 0 } };

describe('quality lifecycle', () => {
  it('rejects legacy and partial completion certificates', () => {
    expect(isQualityComplete(report)).toBe(true);
    expect(isQualityComplete({ ...report, scope: undefined })).toBe(false);
    expect(isQualityComplete({ ...report, scope: { ...report.scope, synthesis_completed: false } })).toBe(false);
    expect(isQualityComplete({ ...report, scope: { ...report.scope, partial: true } })).toBe(false);
  });
  it('maps existing job result and includes narrative progress units', async () => {
    transport.mockResolvedValueOnce({ job_id: 'j', status: 'running', wait_timeout_secs: 3600 })
      .mockResolvedValueOnce({ id: 'j', status: 'completed', result: { report, progress: { stage: 'complete', scope: { critic_units_total: 2, critic_units_completed: 2, audit_units_total: 2, audit_units_completed: 2, narrative_units_total: 2, narrative_units_completed: 2, synthesis_completed: true } } } });
    const progress = vi.fn();
    const result = await compositionApi.qualityReport('p', { chapterId: 'c', modelRef: 'm' }, 't', { onProgress: progress });
    expect(result.report).toEqual(report);
    expect(progress).toHaveBeenCalledWith({ stage: 'complete', completed: 7, total: 7 });
    expect(transport.mock.calls[1][0]).toContain('/jobs/j');
  });
  it('aborts local wait without reporting success', async () => {
    transport.mockResolvedValueOnce({ job_id: 'j', status: 'running' });
    const controller = new AbortController(); controller.abort();
    await expect(compositionApi.qualityReport('p', { chapterId: 'c', modelRef: 'm' }, 't', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('isolates a late chapter response after navigation', async () => {
    let resolve!: (value: any) => void;
    vi.spyOn(compositionApi, 'qualityReport').mockImplementation(() => new Promise((r) => { resolve = r; }));
    const { result, rerender } = renderHook(({ chapter }) => useQualityReport('p', chapter, 't', 'm'), { initialProps: { chapter: 'old' } });
    let pending!: Promise<void>;
    act(() => { pending = result.current.run(); });
    rerender({ chapter: 'new' });
    await act(async () => { resolve({ report, status: 'completed', job_id: 'old', chapter_id: 'old', draft_version: 1 }); await pending; });
    expect(result.current.report).toBeNull();
    expect(result.current.ran).toBe(false);
    expect(result.current.loading).toBe(false);
  });
});
