// Output-budget derivation — the FRONTEND MIRROR of the provider-registry's
// MaxOutputFromContext (services/provider-registry-service/internal/api/
// output_budget.go). The two MUST stay in lockstep: the settings modal previews
// the value the server will store/derive, and generation call sites clamp the
// model's max_output_tokens to the same bounds before sending it.
//
// Practice (established output-budget sizing): the assembled prompt — system
// instructions + grounding pack + manuscript context — needs the majority of
// the window, so the output budget gets the remaining quarter of it:
//
//   max_output = clamp(context_length / 4, 1024, 32768)
//
// The 1024 floor keeps small-window models usable; the 32768 cap is the
// composition service's SCENE_OUTPUT_CEILING (a larger budget 422s there).

export const MIN_OUTPUT_BUDGET = 1024;
export const MAX_OUTPUT_BUDGET = 32768;

/** Derives the optimal output budget from a context-window size.
 *  Returns null when there is no usable context length. */
export function computeMaxOutputTokens(contextLength: number | null | undefined): number | null {
  if (contextLength == null || contextLength <= 0) return null;
  const budget = Math.floor(contextLength / 4);
  if (budget < MIN_OUTPUT_BUDGET) return MIN_OUTPUT_BUDGET;
  if (budget > MAX_OUTPUT_BUDGET) return MAX_OUTPUT_BUDGET;
  return budget;
}

/** Clamps a caller-supplied output budget into the accepted bounds — an
 *  out-of-range value would 422 on the composition endpoints (le=32768)
 *  or starve the generation (below the usable floor). */
export function clampOutputBudget(maxOutputTokens: number | null | undefined): number | null {
  if (maxOutputTokens == null || maxOutputTokens <= 0) return null;
  return Math.min(Math.max(Math.round(maxOutputTokens), MIN_OUTPUT_BUDGET), MAX_OUTPUT_BUDGET);
}
