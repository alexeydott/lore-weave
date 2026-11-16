import { describe, expect, it, vi } from 'vitest';

import { localizedFlagEvidence } from '../flagEvidence';
import type { VerifyFlag } from '../../types';

// The localization contract (#user-report 2026-11-10): a flag with a stable
// evidence_code renders a LOCALIZED sentence interpolated with the measured
// params; anything else falls back to the raw English audit string — never
// prose-parsed, never hidden.

const t = vi.fn((key: string, opts?: Record<string, unknown>) => {
  // Minimal i18next stand-in: known keys render a sentence from the params,
  // unknown keys render the defaultValue (here '' — the miss signal).
  if (key === 'verify.evidence.regurgitation_overlap') {
    return `Совпадение: {{lcs_chars}} симв., {{containment_pct}}%`.replace(
      '{{lcs_chars}}', String(opts?.lcs_chars),
    ).replace('{{containment_pct}}', String(opts?.containment_pct));
  }
  return (opts?.defaultValue as string) ?? '';
});

const base: VerifyFlag = {
  kind: 'regurgitation',
  dimension: 'Способности',
  evidence: 'significant overlap with the source (longest verbatim run 17 chars, n-gram containment 18%)',
  severity: 'medium',
};

describe('localizedFlagEvidence', () => {
  it('localizes a structured flag through its code + params', () => {
    const { text, localized } = localizedFlagEvidence(
      { ...base, evidence_code: 'regurgitation_overlap', evidence_params: { lcs_chars: 17, containment_pct: 18 } },
      t,
    );
    expect(localized).toBe(true);
    expect(text).toBe('Совпадение: 17 симв., 18%');
  });

  it('falls back to the raw audit string when no code is set (old rows)', () => {
    const { text, localized } = localizedFlagEvidence(base, t);
    expect(localized).toBe(false);
    expect(text).toBe(base.evidence);
  });

  it('falls back to the raw audit string for an unknown code', () => {
    const { text, localized } = localizedFlagEvidence(
      { ...base, evidence_code: 'future_kind', evidence_params: {} },
      t,
    );
    expect(localized).toBe(false);
    expect(text).toBe(base.evidence);
  });
});
