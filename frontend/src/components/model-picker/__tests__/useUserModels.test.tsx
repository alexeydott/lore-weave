import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The unified-facade contract (#260-class "changed here, stale everywhere else"):
// invalidateUserModelsCache() must (a) clear the TTL cache so the NEXT picker
// fetch is fresh, and (b) reach ALREADY-MOUNTED pickers via the invalidation
// event — a mounted picker holds its list in local state and never refetches on
// its own, so without the event fan-out a write on one screen left every other
// screen's picker stale until remount.

const { listUserModels } = vi.hoisted(() => ({ listUserModels: vi.fn() }));
vi.mock('@/auth', () => ({ useAuth: () => ({ accessToken: 'tok' }) }));
vi.mock('@/features/ai-models/api', () => ({
  aiModelsApi: { listUserModels: (...a: unknown[]) => listUserModels(...a) },
  getUserModelMeta: (m: { provider_model_name: string }) => ({
    displayName: m.provider_model_name,
    capabilities: ['chat'],
    isFree: false,
    isPriced: false,
  }),
}));

import { useUserModels, invalidateUserModelsCache } from '../useUserModels';

const model = {
  user_model_id: 'm1',
  provider_kind: 'lm_studio',
  provider_model_name: 'qwen3.6-35b-a3b',
  alias: null,
  is_active: true,
  is_favorite: false,
  capability_flags: { chat: true },
  tags: [],
  created_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  listUserModels.mockReset();
  listUserModels.mockResolvedValue({ items: [model] });
  invalidateUserModelsCache(); // clean slate: also exercises the no-listener path
});

describe('useUserModels invalidation fan-out', () => {
  it('a mounted picker refetches when invalidateUserModelsCache fires', async () => {
    const { result } = renderHook(() => useUserModels({ capability: 'chat' }));
    await waitFor(() => expect(result.current.models).toEqual([model]));
    expect(listUserModels).toHaveBeenCalledTimes(1);

    act(() => {
      // The write path on another screen (add/edit/delete in settings/providers).
      invalidateUserModelsCache();
    });
    await waitFor(() => expect(listUserModels).toHaveBeenCalledTimes(2));
    expect(result.current.models).toEqual([model]);
  });

  it('every mounted picker of every capability refetches on one invalidate', async () => {
    const chat = renderHook(() => useUserModels({ capability: 'chat' }));
    const rerank = renderHook(() => useUserModels({ capability: 'rerank' }));
    await waitFor(() => expect(chat.result.current.models).toEqual([model]));
    await waitFor(() => expect(rerank.result.current.models).toEqual([model]));
    const callsAfterMount = listUserModels.mock.calls.length;

    act(() => invalidateUserModelsCache());
    await waitFor(() => expect(listUserModels.mock.calls.length).toBeGreaterThanOrEqual(callsAfterMount + 2));
  });

  it('the TTL cache still dedupes concurrent fetches without invalidation', async () => {
    const a = renderHook(() => useUserModels({ capability: 'chat' }));
    const b = renderHook(() => useUserModels({ capability: 'chat' }));
    await waitFor(() => expect(a.result.current.models).toEqual([model]));
    await waitFor(() => expect(b.result.current.models).toEqual([model]));
    expect(listUserModels).toHaveBeenCalledTimes(1);
  });
});
