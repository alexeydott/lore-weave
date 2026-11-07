package api

// The model's optimal output budget (max_output_tokens) derived from its context
// window. This is the single source of truth for the derivation; the SAME formula
// is mirrored in the frontend (frontend/src/lib/outputBudget.ts) so the settings
// modal can preview the value before it is persisted.
//
// Practice (established output-budget sizing): the assembled prompt — system
// instructions + grounding pack + manuscript context — needs the majority of the
// window, so the output budget gets the remaining quarter of it:
//
//	max_output = clamp(context_length / 4, 1024, 32768)
//
// The 1024 floor keeps small-window models (4k..8k) actually usable for scene
// drafts and technical edits; the 32768 cap is the composition service's own
// SCENE_OUTPUT_CEILING — a budget above it would 422 on every composition call.
// Explicit user overrides (user_models.max_output_tokens) always win; the
// derivation only fills the gap.
const (
	minOutputBudget = 1024
	maxOutputBudget = 32768
)

// MaxOutputFromContext returns the derived output budget for a context window
// size, or 0 when the caller cannot derive one (no/invalid context length).
func MaxOutputFromContext(contextLength int) int {
	if contextLength <= 0 {
		return 0
	}
	budget := contextLength / 4
	if budget < minOutputBudget {
		budget = minOutputBudget
	}
	if budget > maxOutputBudget {
		budget = maxOutputBudget
	}
	return budget
}
