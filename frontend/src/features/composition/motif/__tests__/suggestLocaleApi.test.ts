import { expect, it, vi } from 'vitest';
import { apiJson } from '@/api';
import { motifApi } from '../api';
vi.mock('@/api', () => ({ apiJson: vi.fn().mockResolvedValue({ candidates: [] }) }));
it('serializes display language with the authenticated suggestion request', async () => {
  await motifApi.suggestForChapter('p', 'n', 'auth-token', 5, 'pt-BR');
  const [url, options] = vi.mocked(apiJson).mock.calls.at(-1)!;
  const parsed = new URL(String(url), 'https://example.test');
  expect(parsed.pathname).toContain('/works/p/scenes/n/suggest-motifs');
  expect(parsed.searchParams.get('display_language')).toBe('pt-BR');
  expect(parsed.searchParams.get('limit')).toBe('5');
  expect(options).toEqual({ token: 'auth-token' });
});
