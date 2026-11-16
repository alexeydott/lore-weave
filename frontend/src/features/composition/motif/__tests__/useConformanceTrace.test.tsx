import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { motifApi } from '../api';
import { useConformanceTrace } from '../hooks/useConformanceTrace';
vi.mock('../api', () => ({ motifApi: { conformance: vi.fn(), chapterConformanceRunPropose: vi.fn(), chapterConformanceRunConfirm: vi.fn(), regenerateScene: vi.fn() } }));
const estimate = { confirm_token: 'confirm-a', descriptor: 'test', est_usd: 1, est_tokens: 1, quota_remaining: null };
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(motifApi.conformance).mockResolvedValue({ chapter_id: 'a', calibrated: false, scenes: [] });
  vi.mocked(motifApi.chapterConformanceRunPropose).mockResolvedValue(estimate);
});
it.each(['chapter', 'project', 'token', 'model', 'source'])('discards a late proposal after %s changes, even after returning to the original scope', async (change) => {
  let resolve!: (value: typeof estimate) => void;
  vi.mocked(motifApi.chapterConformanceRunPropose).mockReturnValue(new Promise((r) => { resolve = r; }));
  const initial = { project: 'p', chapter: 'a', token: 'tok', model: 'm', source: 'user_model' as 'user_model' | 'platform_model' };
  const { result, rerender } = renderHook((p) => useConformanceTrace(p.project, p.chapter, p.token, p.model, p.source), { initialProps: initial, wrapper: setup() });
  act(() => result.current.mintRun.mutate());
  await waitFor(() => expect(motifApi.chapterConformanceRunPropose).toHaveBeenCalled());
  rerender({ ...initial, [change]: change === 'source' ? 'platform_model' : 'other' });
  rerender(initial);
  await act(async () => resolve(estimate));
  await waitFor(() => expect(result.current.mintRun.isPending).toBe(false));
  expect(result.current.estimate).toBeNull();
});
it('cancel discards an in-flight proposal', async () => {
  let resolve!: (value: typeof estimate) => void;
  vi.mocked(motifApi.chapterConformanceRunPropose).mockReturnValue(new Promise((r) => { resolve = r; }));
  const { result } = renderHook(() => useConformanceTrace('p', 'a', 'tok', 'm'), { wrapper: setup() });
  act(() => result.current.mintRun.mutate());
  await waitFor(() => expect(motifApi.chapterConformanceRunPropose).toHaveBeenCalled());
  act(() => result.current.cancelRun());
  await act(async () => resolve(estimate));
  expect(result.current.estimate).toBeNull();
});
it('forwards platform source to proposal and regeneration and confirms the displayed token', async () => {
  const { result } = renderHook(() => useConformanceTrace('p', 'a', 'tok', 'm', 'platform_model'), { wrapper: setup() });
  await act(async () => { await result.current.mintRun.mutateAsync(); });
  expect(motifApi.chapterConformanceRunPropose).toHaveBeenCalledWith({ projectId: 'p', chapterId: 'a', modelRef: 'm', modelSource: 'platform_model' }, 'tok');
  await act(async () => { await result.current.regenerateScene.mutateAsync('scene'); });
  expect(motifApi.regenerateScene).toHaveBeenCalledWith('p', 'scene', 'm', 'tok', 'platform_model');
  await act(async () => { await result.current.confirmRun.mutateAsync(); });
  expect(motifApi.chapterConformanceRunConfirm).toHaveBeenCalledWith('confirm-a', 'tok');
  expect(result.current.estimate).toBeNull();
});
