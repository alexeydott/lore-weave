import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutlineNode } from '@/features/composition/types';
import { referenceShelfApi, type ReferenceAnswer } from '../../referenceShelfApi';
import { useReferenceShelf } from '../useReferenceShelf';
vi.mock('../../referenceShelfApi', () => ({ referenceShelfApi: { list: vi.fn(), ask: vi.fn() } }));
const node = { id: 'node1', pov_entity_id: 'alice', present_entity_ids: ['bob'] } as OutlineNode;
const roster = [{ id: 'alice', label: 'Alice' }, { id: 'bob', label: 'Bob' }];
const answer = { answer: 'Evidence', citations: [], references: { sources: {} } } as unknown as ReferenceAnswer;
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return renderHook(({ book, current, token }) => useReferenceShelf(book, current, roster, token), {
    initialProps: { book: 'book1', current: node, token: 'token1' },
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}
beforeEach(() => { vi.resetAllMocks(); vi.mocked(referenceShelfApi.list).mockResolvedValue({ book_id: 'book1', entity_id: 'alice', sources: {}, _meta: { note: '' } }); vi.mocked(referenceShelfApi.ask).mockResolvedValue(answer); });
describe('useReferenceShelf', () => {
  it('loads deterministic references but never asks automatically or on quick prompt changes', async () => {
    const { result } = setup();
    await waitFor(() => expect(referenceShelfApi.list).toHaveBeenCalledWith('book1', 'alice', 20, 'token1'));
    act(() => result.current.setQuestion('Summarize'));
    expect(referenceShelfApi.ask).not.toHaveBeenCalled();
    await act(() => result.current.ask('en'));
    expect(referenceShelfApi.ask).toHaveBeenCalledWith('book1', 'alice', { question: 'Summarize', locale: 'en' }, 'token1');
    expect(result.current.answer?.answer).toBe('Evidence');
  });
  it.each(['book', 'node', 'auth', 'entity'] as const)('clears old answer and draft across %s scope changes', async change => {
    const { result, rerender } = setup();
    act(() => result.current.setQuestion('Question'));
    await act(() => result.current.ask('en'));
    expect(result.current.answer).toBeDefined();
    if (change === 'entity') act(() => result.current.selectEntity('bob'));
    else rerender({ book: change === 'book' ? 'book2' : 'book1', current: change === 'node' ? { ...node, id: 'node2' } : node, token: change === 'auth' ? 'token2' : 'token1' });
    expect(result.current.answer).toBeUndefined();
    expect(result.current.question).toBe('');
    expect(result.current.busy).toBe(false);
  });
  it('rejects late assistant results when the model changes', async () => {
    let finish!: (value: ReferenceAnswer) => void;
    vi.mocked(referenceShelfApi.ask).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { result } = setup();
    act(() => result.current.setQuestion('Question'));
    let pending!: Promise<void>;
    act(() => { pending = result.current.ask('en'); });
    act(() => result.current.setModel('model2'));
    await act(async () => { finish(answer); await pending; });
    expect(result.current.answer).toBeUndefined();
    expect(result.current.busy).toBe(false);
  });
  it('discards a late answer after leaving and returning to the same node', async () => {
    let finish!: (value: ReferenceAnswer) => void;
    vi.mocked(referenceShelfApi.ask).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { result, rerender } = setup();
    act(() => result.current.setQuestion('Question'));
    let pending!: Promise<void>;
    act(() => { pending = result.current.ask('en'); });
    rerender({ book: 'book1', current: { ...node, id: 'node2' }, token: 'token1' });
    rerender({ book: 'book1', current: node, token: 'token1' });
    await act(async () => { finish(answer); await pending; });
    expect(result.current.answer).toBeUndefined();
    expect(result.current.question).toBe('');
  });
  it('caps show more at 100 and never retries failed assistant calls', async () => {
    vi.mocked(referenceShelfApi.ask).mockRejectedValue(new Error('unavailable'));
    const { result } = setup();
    for (let i = 0; i < 8; i++) act(() => result.current.showMore());
    expect(result.current.limit).toBe(100);
    act(() => result.current.setQuestion('Question'));
    await act(() => result.current.ask('en'));
    expect(referenceShelfApi.ask).toHaveBeenCalledTimes(1);
    expect(result.current.assistantError).toBe(true);
  });
});
