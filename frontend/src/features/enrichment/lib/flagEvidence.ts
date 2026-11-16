import type { TFunction } from 'i18next';
import type { VerifyFlag } from '../types';

/**
 * Localizes one verify flag's evidence (#user-report 2026-11-10).
 *
 * Prefers the STRUCTURED path: `verify.evidence.{evidence_code}` interpolated
 * with the measured `evidence_params` — a real localized sentence, never prose
 * parsing. Falls back to the raw English `evidence` (the audit record) for rows
 * persisted before structured evidence existed and for kinds whose evidence
 * embeds free source data (contradiction/anachronism quotes).
 *
 * Returns { text, localized } so the UI can style a fallback (e.g. keep the raw
 * audit string visibly technical) without hiding the warning.
 */
export function localizedFlagEvidence(
  flag: VerifyFlag,
  t: TFunction,
): { text: string; localized: boolean } {
  const code = flag.evidence_code;
  if (code) {
    const key = `verify.evidence.${code}`;
    const translated = t(key, {
      ...(flag.evidence_params ?? {}),
      defaultValue: '',
      interpolation: { escapeValue: false },
    });
    // i18next with defaultValue '' returns '' only when the key is missing —
    // a translated sentence is non-empty, so '' ⇒ no key for this code.
    if (translated) return { text: translated, localized: true };
  }
  return { text: flag.evidence, localized: false };
}
