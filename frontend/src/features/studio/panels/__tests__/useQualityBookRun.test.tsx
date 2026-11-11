import { createElement, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compositionApi, type QualityBookRun } from '@/features/composition/api';
import { qualityFailureReason } from '@/features/composition/components/QualityReportStatus';
import { useQualityBookRun } from '../useQualityBookRun';

const model = { model_source: 'user_model' as const, model_ref: 'm' };
const run: QualityBookRun = { ...model, estimated_calls_max: 20, estimated_usd_max: 1, id: 'r', project_id: 'p', book_id: 'b', status: 'running', stop_requested: false, total: 3, completed: 1, failed: 1, current_chapter_id: 'c', chapters: [], created_at: '', updated_at: '' };
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
}
afterEach(() => vi.restoreAllMocks());
describe('durable quality book runs', () => {
  it('reattaches after unmount without submitting, preserving progress and stop-after-current', async () => {
    vi.spyOn(compositionApi, 'listQualityRuns').mockResolvedValue({ runs: [run] });
    const start = vi.spyOn(compositionApi, 'startQualityRun');
    const stop = vi.spyOn(compositionApi, 'stopQualityRun').mockResolvedValue({ ...run, stop_requested: true });
    const first = renderHook(() => useQualityBookRun('p', 'b', 'account', model), { wrapper: wrapper() });
    await waitFor(() => expect(first.result.current.run?.id).toBe('r'));
    first.unmount();
    const second = renderHook(() => useQualityBookRun('p', 'b', 'account', model), { wrapper: wrapper() });
    await waitFor(() => expect(second.result.current.run?.completed).toBe(1));
    expect(second.result.current.run?.failed).toBe(1);
    expect(start).not.toHaveBeenCalled();
    await act(async () => { await second.result.current.stop(); });
    expect(stop).toHaveBeenCalledWith('p', 'r', 'account');
    expect(second.result.current.run?.status).toBe('running');
    expect(second.result.current.run?.stop_requested).toBe(true);
    second.unmount();
  });
  it('isolates account, model and book query state', async () => {
    vi.spyOn(compositionApi, 'listQualityRuns').mockImplementation(async (_p, selection, token) => ({ runs: token === 'a' && selection.model_ref === 'm' ? [run] : [] }));
    const hook = renderHook(({ book, token, ref }) => useQualityBookRun('p', book, token, { ...model, model_ref: ref }), { wrapper: wrapper(), initialProps: { book: 'b', token: 'a', ref: 'm' } });
    await waitFor(() => expect(hook.result.current.run?.id).toBe('r'));
    hook.rerender({ book: 'other', token: 'a', ref: 'm' });
    await waitFor(() => expect(hook.result.current.run).toBeNull());
    hook.rerender({ book: 'b', token: 'other', ref: 'm' });
    await waitFor(() => expect(hook.result.current.run).toBeNull());
    hook.rerender({ book: 'b', token: 'a', ref: 'other' });
    await waitFor(() => expect(hook.result.current.run).toBeNull());
    hook.unmount();
  });
  it('requires an estimate and explicit confirmation with both budget ceilings', async () => {
    vi.spyOn(compositionApi, 'listQualityRuns').mockResolvedValue({ runs: [] });
    const estimate = vi.spyOn(compositionApi, 'estimateQualityRun').mockResolvedValue({ estimated_calls_max: 20, estimated_usd_max: 0.75, total: 3, chapters: [] });
    const start = vi.spyOn(compositionApi, 'startQualityRun').mockResolvedValue(run);
    const hook = renderHook(() => useQualityBookRun('p', 'b', 'a', model), { wrapper: wrapper() });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    await act(async () => { await hook.result.current.confirm(); });
    expect(start).not.toHaveBeenCalled();
    await act(async () => { await hook.result.current.prepare(); });
    expect(estimate).toHaveBeenCalledWith('p', model, 'a');
    expect(start).not.toHaveBeenCalled();
    await act(async () => { await hook.result.current.confirm(); });
    expect(start).toHaveBeenCalledWith('p', { ...model, idempotency_key: expect.any(String), max_estimated_calls: 20, max_estimated_usd: 0.75 }, 'a');
    hook.unmount();
  });
  it('preserves the submission key for explicit retry after an ambiguous transport failure', async () => {
    vi.spyOn(compositionApi, 'listQualityRuns').mockResolvedValue({ runs: [] });
    vi.spyOn(compositionApi, 'estimateQualityRun').mockResolvedValue({ estimated_calls_max: 20, estimated_usd_max: 0.75, total: 3, chapters: [] });
    const start = vi.spyOn(compositionApi, 'startQualityRun').mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(run);
    const hook = renderHook(() => useQualityBookRun('p', 'b', 'a', model), { wrapper: wrapper() });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    await act(async () => { await hook.result.current.prepare(); });
    await act(async () => { await hook.result.current.confirm(); });
    expect(hook.result.current.error).toMatchObject({ stage: 'start', code: 'TRANSPORT_ERROR' });
    expect(hook.result.current.estimate).not.toBeNull();
    expect(start).toHaveBeenCalledTimes(1);
    const firstBody = start.mock.calls[0][1];
    expect(firstBody.idempotency_key).toEqual(expect.any(String));
    await act(async () => { await hook.result.current.confirm(); });
    expect(start).toHaveBeenCalledTimes(2);
    expect(start.mock.calls[1][1]).toEqual(firstBody);
    expect(hook.result.current.estimate).toBeNull();
    expect(hook.result.current.run?.id).toBe('r');
    hook.unmount();
  });
  it('recovers an initial transient history read automatically without paid submission', async () => {
    const list = vi.spyOn(compositionApi, 'listQualityRuns').mockRejectedValueOnce(new Error('HTTP 500')).mockResolvedValue({ runs: [] });
    const start = vi.spyOn(compositionApi, 'startQualityRun');
    const hook = renderHook(() => useQualityBookRun('p', 'b', 'a', model), { wrapper: wrapper() });
    await waitFor(() => expect(hook.result.current.run).toBeNull(), { timeout: 2500 });
    expect(list).toHaveBeenCalledTimes(2);
    expect(hook.result.current.historyError).toBe(false);
    expect(hook.result.current.error).toBeNull();
    expect(start).not.toHaveBeenCalled();
    hook.unmount();
  });
  it('retains the previous run on transient history failure and clears it on safe retry', async () => {
    const list = vi.spyOn(compositionApi, 'listQualityRuns').mockResolvedValue({ runs: [{ ...run, status: 'completed' }] });
    const start = vi.spyOn(compositionApi, 'startQualityRun');
    const hook = renderHook(() => useQualityBookRun('p', 'b', 'a', model), { wrapper: wrapper() });
    await waitFor(() => expect(hook.result.current.run?.id).toBe('r'));
    list.mockRejectedValue(new Error('HTTP 500'));
    await act(async () => { await hook.result.current.retryHistory(); });
    expect(hook.result.current.historyError).toBe(true);
    expect(hook.result.current.run?.id).toBe('r');
    expect(hook.result.current.error).toBeNull();
    list.mockResolvedValue({ runs: [] });
    await act(async () => { await hook.result.current.retryHistory(); });
    expect(hook.result.current.historyError).toBe(false);
    expect(hook.result.current.run).toBeNull();
    expect(start).not.toHaveBeenCalled();
    hook.unmount();
  }, 10000);
  it('fences late action failures when the book scope changes', async () => {
    vi.spyOn(compositionApi, 'listQualityRuns').mockResolvedValue({ runs: [] });
    let reject!: (error: Error) => void;
    vi.spyOn(compositionApi, 'estimateQualityRun').mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
    const hook = renderHook(({ book }) => useQualityBookRun('p', book, 'a', model), { wrapper: wrapper(), initialProps: { book: 'b' } });
    let pending!: Promise<void>;
    act(() => { pending = hook.result.current.prepare(); });
    hook.rerender({ book: 'new' });
    await act(async () => { reject(new Error('old action failure')); await pending; });
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.busy).toBe(false);
    hook.unmount();
  });
  it('does not diagnose unknown or synthesis errors as provider outages', () => {
    expect(qualityFailureReason('unexpected')).toBe('unknown');
    expect(qualityFailureReason('critic_synthesis_invalid_response')).toBe('synthesis_invalid_response');
    expect(qualityFailureReason('audit_incomplete')).toBe('incomplete');
  });
});
