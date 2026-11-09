// LOOM Composition · Q1+Q2 Quality Report (view) — read-only advisory panel in the Polish gate.
//
// Surfaces the planner's own judges to the author: the 4-dim critic (coherence / voice / pacing /
// canon + violations) and the chapter's narrative threads (raised / resolved). Diagnostic only —
// no accept/reject, no apply. It informs; the author decides what to rewrite. When self-heal
// proposals are present it LINKS each critic canon violation to a matching proposed fix
// (D-QUALITY-CRITIC-HEAL-LINK) so the author doesn't double-count the same issue.
import { useTranslation } from 'react-i18next';

import { QualityReason, QualityScopeWarning } from "./QualityReportStatus";
import { useQualityReport } from '../hooks/useQualityReport';
import { isQualityComplete, type QualityCritic, type SelfHealProposal } from '../api';

interface Props {
  projectId: string;
  chapterId: string;
  token: string | null;
  modelRef: string;
  modelSource?: 'user_model' | 'platform_model';
  // The current self-heal proposals (if the author has run Polish) — used to mark which critic
  // violations already have a proposed fix. Optional: the report stands alone without them.
  proposals?: SelfHealProposal[];
}

const DIMS: (keyof Pick<QualityCritic, 'coherence' | 'voice_match' | 'pacing' | 'canon_consistency'>)[] = [
  'coherence', 'voice_match', 'pacing', 'canon_consistency',
];

// A critic violation and a self-heal proposal describe the SAME issue when their spans overlap
// (the critic's `span` excerpt vs the proposal's located `before`). Normalize + substring-either-way,
// with a min length so a trivial shared word doesn't false-match.
function _hasProposedFix(span: string, proposals: SelfHealProposal[]): boolean {
  const s = (span || '').trim().toLowerCase();
  if (s.length < 6) return false;
  return proposals.some((p) => {
    const b = (p.before || '').trim().toLowerCase();
    return b.length >= 6 && (b.includes(s) || s.includes(b));
  });
}

export function QualityReportSection({ projectId, chapterId, token, modelRef, modelSource = 'user_model', proposals = [] }: Props) {
  const { t } = useTranslation('composition');
  const q = useQualityReport(projectId, chapterId, token, modelRef, modelSource);
  const critic = q.report?.critic;
  const threads = q.report?.threads;

  return (
    <div data-testid="composition-quality-report" className="mt-3 flex flex-col gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
          {t('qualityTitle', { defaultValue: 'Quality report' })}
        </span>
        <button
          type="button"
          data-testid="quality-run"
          disabled={!modelRef || q.loading}
          onClick={() => q.run()}
          className="rounded bg-sky-600 px-2 py-1 text-[11px] text-white disabled:opacity-50"
        >
          {q.loading
            ? t('qualityLoading', { defaultValue: 'Analyzing…' })
            : q.ran
              ? t('qualityRerun', { defaultValue: 'Re-analyze' })
              : t('qualityRun', { defaultValue: 'Analyze quality' })}
        </button>
      </div>
      <p className="text-[11px] text-neutral-400">
        {t('qualityIntro', {
          defaultValue: 'Advisory only — how the chapter scores and what it promises but never pays off. Nothing here changes your prose.',
        })}
      </p>

      {q.loading && <div data-testid="quality-progress" role="status" className="text-[11px] text-neutral-500">
        {q.progress ? t("qualityProgress", { completed: q.progress.completed, total: q.progress.total }) : t("qualityLoading")}
        <button type="button" data-testid="quality-stop-waiting" onClick={q.cancel} className="ml-2 underline">{t("qualityStopWaiting")}</button>
      </div>}
      {q.stopped && <div data-testid="quality-stopped" role="status" className="text-[11px] text-amber-600">{t("qualityStopWaiting")}</div>}
      {q.error && <div data-testid="quality-error" className="text-[11px] text-amber-600">{q.error}</div>}

      <QualityScopeWarning scope={q.report?.scope ?? critic?.scope ?? threads?.scope} />

      {critic && (
        <div className="flex flex-wrap gap-2" data-testid="quality-critic">
          {critic.error ? (
            <QualityReason error={critic.error} />
          ) : (
            DIMS.map((d) => (
              <span key={d} className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {t(d)}: {critic[d] ?? '—'}/5
              </span>
            ))
          )}
        </div>
      )}

      {critic && critic.violations.length > 0 && (
        <ul className="flex flex-col gap-0.5" data-testid="quality-violations">
          {critic.violations.map((v, i) => {
            const fixed = _hasProposedFix(v.span, proposals);
            return (
              <li key={i} className="text-[11px] text-rose-500">
                ⚠ {v.why}{v.span ? ` — “${v.span}”` : ''}
                {fixed && (
                  <span data-testid="violation-has-fix" className="ml-1 rounded bg-emerald-100 px-1 text-[9px] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    {t('qualityHasFix', { defaultValue: 'fix proposed ↓' })}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {threads?.selection?.exhaustive === false && (
        <div data-testid="quality-threads-selection" role="status" className="text-[11px] text-amber-600">
          {t("qualityThreadsSelection", {
            maxPromises: threads.selection.per_call_max_promises ?? threads.selection.max_promises ?? 12,
            maxPhraseChars: threads.selection.max_phrase_chars ?? 80,
          })}
        </div>
      )}

      {threads?.error && (
        <span data-testid="quality-threads-na" className="text-[11px] text-neutral-400">
          <QualityReason error={threads.error} />
        </span>
      )}

      {threads && !threads.error && (
        <div className="flex flex-col gap-1" data-testid="quality-threads">
          {/* Informational: the threads this chapter opens (NOT a defect — a setup paid off
              later is normal; the book-level coverage flags anything actually abandoned). */}
          {threads.raised.length > 0 ? (
            <>
              <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
                {t('qualityThreadsRaised', { defaultValue: '{{n}} thread(s) raised in this chapter:', n: threads.raised_count })}
              </span>
              <ul className="flex flex-col gap-0.5">
                {threads.raised.map((p, i) => (
                  <li key={i} className="text-[11px] text-neutral-500">• {p}</li>
                ))}
              </ul>
            </>
          ) : (
            q.ran && q.report && isQualityComplete(q.report) && threads.selection?.exhaustive === true && <span className="text-[11px] text-neutral-400">{t('qualityNoThreads', { defaultValue: 'No new threads raised in this chapter.' })}</span>
          )}
          {threads.resolved.length > 0 && (
            <span className="text-[10px] text-emerald-600">
              {t('qualityThreadsResolved', { defaultValue: '{{r}} paid off here', r: threads.resolved_count })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
