import { afterEach, describe, expect, it, vi } from 'vitest';
import { compositionApi } from '../api';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('quality snapshot endpoint request deadlines', () => {
  for (const stage of ['estimate', 'start'] as const) {
    it(`allows ${stage} snapshot preparation to finish after the generic twenty-second deadline`, async () => {
      vi.useFakeTimers();
      const fetch = vi.fn(() => new Promise<Response>((resolve) => setTimeout(() => resolve(new Response(JSON.stringify({ id: 'run', total: 2 }), { status: 200 })), 47_360)));
      vi.stubGlobal('fetch', fetch);
      const selection = { model_source: 'user_model' as const, model_ref: 'm' };
      const request = stage === 'estimate' ? compositionApi.estimateQualityRun('p', selection, 't') : compositionApi.startQualityRun('p', { ...selection, idempotency_key: 'same-key', max_estimated_calls: 20, max_estimated_usd: 1 }, 't');
      const settled = vi.fn();
      const observed = request.then((value) => { settled(); return value; });
      await vi.advanceTimersByTimeAsync(20_001);
      expect(settled).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(27_359);
      expect(await observed).toMatchObject({ total: 2 });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0][0]).toContain(stage === 'estimate' ? '/quality-runs/estimate' : '/quality-runs');
    });
  }
});
