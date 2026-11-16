import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { motifApi } from '../api';
import { useMotifSuggestions } from '../hooks/useMotifSuggestions';
const locale = vi.hoisted(() => ({ language: 'ru' }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: locale }) }));
vi.mock('../api', () => ({ motifApi: { suggestForChapter: vi.fn() } }));
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 3, retryDelay: 0 } } });
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  vi.resetAllMocks();
  locale.language = 'ru';
  vi.mocked(motifApi.suggestForChapter).mockResolvedValue({ candidates: [] });
});
it('isolates locale and authentication caches and forwards the active language', async () => {
  const { rerender } = renderHook(({ token }) => useMotifSuggestions('p', 'n', token, true), { initialProps: { token: 'a' }, wrapper: setup() });
  await waitFor(() => expect(motifApi.suggestForChapter).toHaveBeenCalledWith('p', 'n', 'a', 5, 'ru'));
  locale.language = 'en';
  rerender({ token: 'a' });
  await waitFor(() => expect(motifApi.suggestForChapter).toHaveBeenCalledWith('p', 'n', 'a', 5, 'en'));
  rerender({ token: 'b' });
  await waitFor(() => expect(motifApi.suggestForChapter).toHaveBeenCalledWith('p', 'n', 'b', 5, 'en'));
  expect(motifApi.suggestForChapter).toHaveBeenCalledTimes(3);
});
it('never retries implicitly but permits an explicit retry', async () => {
  vi.mocked(motifApi.suggestForChapter).mockRejectedValue(new Error('unavailable'));
  const { result } = renderHook(() => useMotifSuggestions('p', 'n', 'a', true), { wrapper: setup() });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(motifApi.suggestForChapter).toHaveBeenCalledTimes(1);
  await act(async () => { await result.current.refetch(); });
  expect(motifApi.suggestForChapter).toHaveBeenCalledTimes(2);
});
it('does not request suggestions without authentication', () => {
  renderHook(() => useMotifSuggestions('p', 'n', null, true), { wrapper: setup() });
  expect(motifApi.suggestForChapter).not.toHaveBeenCalled();
});
