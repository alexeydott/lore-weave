import type { TFunction } from 'i18next';

export type RankingReason = {
  degraded?: boolean;
  degradation_reason?: 'model_unset' | 'settings_unavailable' | 'embed_failed' | 'empty_query' | 'vector_unavailable' | null;
  section?: 'mine' | 'library';
  summary?: string;
  [key: string]: unknown;
};

/** Unknown/legacy failures must never imply a missing model configuration. */
export function rankingUnavailable(t: TFunction, reason: RankingReason): string {
  switch (reason.degradation_reason) {
    case 'model_unset':
      return reason.section === 'mine'
        ? t('motif.suggest.degradedMine')
        : t('motif.suggest.degradedLibrary');
    case 'settings_unavailable':
    case 'embed_failed':
      return t('motif.suggest.providerUnavailable');
    case 'empty_query':
      return t('motif.suggest.emptyQuery');
    default:
      return t('motif.suggest.rankingUnavailable');
  }
}

export function rankingSummary(t: TFunction, reason: RankingReason | string | null): string {
  if (typeof reason === 'string') return reason;
  if (!reason) return '';
  if (reason.degraded) return rankingUnavailable(t, reason);
  return typeof reason.summary === 'string' ? reason.summary : t('motif.suggest.semanticMatch');
}
