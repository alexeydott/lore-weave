# Scene inspector live acceptance — 2026-11-09

## Scope and method

GUI-only black-box verification of the deployed Studio at localhost:5174, existing authenticated book, Russian UI, 1280×1204 viewport. No setup changes, code changes, persisted book writes, paid analysis requests or configuration changes were performed. Each recorded interaction was checked against DOM observations and a viewed screenshot. Browser runtime does not expose console capture; no console certification is claimed. Screenshot artifacts are retained at the absolute paths below; they were not published externally.

## Verdict

**Not fully accepted.** Direct contextual editing and draft cancellation passed, but scene navigation blocked inspector-specific verification. Write/save and partial failure were deliberately not exercised on real planning data; previous automated tests are not live evidence.

## Passed

1. Conformance tab loads its existing timestamp and prerequisite state. Clicking **Edit motif** directly opens the contextual dialog without inspector scrolling. Initially Save is disabled.
   - Evidence: `C:\Users\atemu\.zcode\cli\artifacts\session_6c749ce714fee411f141b40025536327\call_7A3B8oSXqb4RDZPX3clPxMs2-tool-result-d6d04365-274f-4c57-8231-21269f44d17e.png`
2. Searching by `hook.unexpected_arrival` filters the choices to the corresponding Russian motif plus freeform. Selection displays Russian summary, beat and role, explicit unsaved status and enabled Save. No Save action was performed.
   - Evidence: `C:\Users\atemu\.zcode\cli\artifacts\session_6c749ce714fee411f141b40025536327\call_PdItgjKfPG2UggqaueIWvUgt-tool-result-5feb2024-83d7-4dfc-a546-b28ec35afb1e.png`
3. Cancel on dirty draft opens confirmation; **Discard draft** closes both dialogs. Reopening through **Bind motif** shows freeform again and disabled Save. Cancel without changes closes immediately. Search text remains from the previous session; the discarded motif selection does not.
   - Confirmation evidence: `C:\Users\atemu\.zcode\cli\artifacts\session_6c749ce714fee411f141b40025536327\call_URQyTX7bILfOhHGFxVcralVQ-tool-result-fcaca3c4-f03c-46b4-9606-b6f23dae70a9.png`
   - Closed evidence: `C:\Users\atemu\.zcode\cli\artifacts\session_6c749ce714fee411f141b40025536327\call_ET5T3QUWOBj9Pa8maRBoYVz9-tool-result-4c149a5d-9aa0-4789-84b7-f656bd07f924.png`
   - Reopened evidence: `C:\Users\atemu\.zcode\cli\artifacts\session_6c749ce714fee411f141b40025536327\call_PCIYTrwjjKIAHNiq0inYskgR-tool-result-7bcd887b-58da-481d-b2bc-993a97889944.png`

## Findings

- **P1 navigation/acceptance blocker:** Inspector requests scene selection. Plan navigation displays no arcs and offers planning rather than the existing scene. Quick search for “scene” returns no match; searching the existing prologue opens its manuscript and shows one scene in the editor sidebar, but its unnamed row does not expose an understandable scene navigation control. Do not infer the precise backend cause from GUI evidence. Existing scene accessibility without arcs needs investigation.
  - Evidence: `C:\Users\atemu\.zcode\cli\artifacts\session_6c749ce714fee411f141b40025536327\call_bvQORhfXeZlCWsSXyKZnikKY-tool-result-12da55bf-1a7d-4b25-864c-a0f92fb08664.png`
- **P2 missing context identity:** The contextual editor for the unnamed scene has only the generic “Scene motif” heading; there is no scene-number/chapter fallback. The Conformance row likewise has no readable scene identifier. This weakens safe contextual editing.
  - Evidence: direct-opening screenshot above.
- **P3 duplicated warning:** Discard confirmation repeats the same description as both subtitle and body.
  - Evidence: confirmation screenshot above.
- **P3 control clarity/accessibility:** The close button has the English accessible name `Close` in Russian UI. Save and Cancel are visually plain and adjacent with little differentiation; disabled Save is not strongly distinguished in the captured theme.
  - Evidence: direct-opening and selected-motif screenshots above.

## Blocked or not executed

- Inspector entry to the shared editor; scene-link labels; grounding content/retry: blocked by scene selection/navigation in this pass.
- Persisted Save, removal, role writes, duplicate writes and partial-save recovery: not executed because they mutate real planning data. Require an approved disposable fixture or explicit bounded authorization for chosen real changes.
- Paid recommendations, live conformance judge and prose generation: not run.
- Role assignment changes, Escape/backdrop behavior, full keyboard/focus audit, empty-search feedback, language switching and narrow viewport: not certified by this pass.
- No blanket claim of complete live acceptance, all-locale visual certification or console-error absence.
