import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { useSceneMotifDraft } from '../hooks/useSceneMotifDraft';
import { motifApi } from '../api';
vi.mock('../../api', () => ({ compositionApi: { getMotifBindings: vi.fn().mockRejectedValue(new Error('offline')) } }));
vi.mock('../api', () => ({ motifApi: { saveSceneMotif: vi.fn(), saveSceneRole: vi.fn() } }));
const swap = vi.mocked(motifApi.saveSceneMotif);
const role = vi.mocked(motifApi.saveSceneRole);
function setup() {
 const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
 const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
 return renderHook(({ scene }) => useSceneMotifDraft('p', 'ch', scene, 'auth', 'book'), { wrapper, initialProps: { scene: 'a' } });
}
beforeEach(() => { vi.resetAllMocks(); swap.mockResolvedValue({}); role.mockResolvedValue({}); });
describe('scene motif explicit draft lifecycle', () => {
 it('never writes before Save and discards local edits on cancel', () => {
  const h = setup();
  act(() => h.result.current.begin(null));
  act(() => h.result.current.update({ motifId: 'm', roles: { hero: 'e' } }));
  expect(swap).not.toHaveBeenCalled(); expect(role).not.toHaveBeenCalled();
  act(() => h.result.current.close());
  expect(h.result.current.active).toBeNull(); expect(swap).not.toHaveBeenCalled();
 });
 it('retains failed drafts and retries only remaining operations after partial success', async () => {
  const h = setup(); act(() => h.result.current.begin(null));
  act(() => h.result.current.update({ motifId: 'm', roles: { hero: 'e', foe: null } }));
  role.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('failure'));
  await act(async () => { await h.result.current.save(); });
  expect(h.result.current.active?.partial).toBe(true);
  expect(h.result.current.active?.error).toBe(true);
  await act(async () => { await h.result.current.save(); });
  expect(swap).toHaveBeenCalledTimes(1); expect(role).toHaveBeenCalledTimes(3);
  expect(role.mock.calls[2][2]).toBe('foe'); expect(h.result.current.active).toBeNull();
 });
 it('isolates scenes and stops further role writes after an in-flight scene switch', async () => {
  const h = setup(); let finish!: (v: object) => void;
  swap.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  act(() => h.result.current.begin(null)); act(() => h.result.current.update({ motifId: 'm', roles: { hero: 'e' } }));
  let saving!: Promise<boolean>; act(() => { saving = h.result.current.save(); });
  h.rerender({ scene: 'b' }); expect(h.result.current.active).toBeNull();
  await act(async () => { finish({}); await saving; });
  expect(role).not.toHaveBeenCalled();
 });
 it('rejects synchronous duplicate Save and retains a failed first operation', async () => {
  const h = setup(); act(() => h.result.current.begin(null)); act(() => h.result.current.update({ motifId: 'm', roles: {} }));
  swap.mockRejectedValue(new Error('failure'));
  await act(async () => { await Promise.all([h.result.current.save(), h.result.current.save()]); });
  await waitFor(() => expect(h.result.current.active?.error).toBe(true));
  expect(swap).toHaveBeenCalledTimes(1); expect(h.result.current.active?.partial).toBe(false);
 });
});
