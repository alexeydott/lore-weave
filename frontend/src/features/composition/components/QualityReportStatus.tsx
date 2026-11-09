import { useTranslation } from 'react-i18next';
import type { QualityScope } from '../api';

const REASONS = ['context_limit', 'network', 'unavailable', 'reasoning_exhausted', 'truncated', 'invalid_response'] as const;

export function QualityReason({ error }: { error: string }) {
  const { t } = useTranslation('composition');
  const reason = REASONS.find((code) => error === `critic_${code}` || error === `audit_${code}`) ?? 'unavailable';
  return <span data-testid="quality-reason" className="text-[11px] text-amber-600">{t(`qualityReasons.${reason}`)} {t('qualityReasons.manualRetry')}</span>;
}

export function QualityScopeWarning({ scope }: { scope?: QualityScope }) {
  const { t } = useTranslation('composition');
  if (!scope?.partial) return null;
  return (
    <div data-testid="quality-partial" role="status" className="text-[11px] text-amber-600">
      {t('qualityScope.partial')}
      {scope.chapter_partial && <> {t('qualityScope.chapter', { analyzed: scope.windows_analyzed, total: scope.windows_total })}</>}
      {scope.canon_partial && <> {t('qualityScope.canon', { selected: scope.canon_lines_selected, total: scope.canon_lines_total })}</>}
    </div>
  );
}
