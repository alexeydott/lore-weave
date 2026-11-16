import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { rankingUnavailable, rankingSummary, type RankingReason } from '../ranking';

const t = ((key: string) => key) as TFunction;

describe('ranking degradation causes', () => {
  it.each(['embed_failed', 'settings_unavailable'] as const)('does not call %s missing model configuration', (degradation_reason) => {
    expect(rankingUnavailable(t, { section: 'mine', degradation_reason })).toBe('motif.suggest.providerUnavailable');
  });
  it.each(['mine', 'library'] as const)('only model_unset uses the %s configuration guidance', (section) => {
    expect(rankingUnavailable(t, { section, degradation_reason: 'model_unset' })).toBe(`motif.suggest.degraded${section === 'mine' ? 'Mine' : 'Library'}`);
  });
  it.each([undefined, null, 'future_reason', 'vector_unavailable'])('uses honest generic guidance for %s', (cause) => {
    expect(rankingUnavailable(t, { degradation_reason: cause } as RankingReason)).toBe('motif.suggest.rankingUnavailable');
  });
  it('does not expose internal structured reason keys', () => {
    expect(rankingSummary(t, { cosine: .9, genre: .1 })).toBe('motif.suggest.semanticMatch');
  });
});
