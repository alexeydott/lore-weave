# docs/plans — how to read this folder

> 584 planning artifacts, 2026-05 → 2026-09. This index is the map; the plans themselves are
> historical evidence and are NOT kept status-accurate line-by-line (529 of them carry no
> checkbox markup at all). When a plan contradicts the code, **the code wins**; where a
> decision record contradicts a plan, the record wins (see §3).

## 1 · What is ALIVE (read these first)

| Artifact | What it is | Status |
|---|---|---|
| [`2026-07-13-studio-tool-gui-MASTER-IMPL.md`](2026-07-13-studio-tool-gui-MASTER-IMPL.md) | The studio tool↔GUI umbrella: sealed decisions, wave sequence, panel ledger, defer register | Build ran; ledger reconciled 2026-11-24 |
| [`2026-07-13-studio-tool-gui-RUN-STATE.md`](2026-07-13-studio-tool-gui-RUN-STATE.md) | The 192-slice board. **The `TODO` cells are a 2026-07-13 snapshot** — read the per-wave `RECONCILED 2026-11-24` blocks inserted before each wave section | Reconciled 2026-11-24 |
| [`studio-adjudication/README.md`](studio-adjudication/README.md) + `wave-*-decisions.md` | 586 adjudicated questions over specs 29–38. **Decision records — never rewrite their paths or lines**; where they contradict a wave plan, they win | Frozen evidence |
| [`2026-07-16-studio-completeness-8-session-orchestration.md`](2026-07-16-studio-completeness-8-session-orchestration.md) | How the build was actually executed: 8 functional sessions, not 10 waves | Framework; sessions closed |
| `2026-07-16-studio-session-S1..S8-RUN-STATE.md` | The session boards — 97 `DONE` rows. These, not the wave board, recorded execution | S2/S4/S8 carry open leftovers (see §4) |
| [`2026-09-18-close-v010-leftovers.md`](2026-09-18-close-v010-leftovers.md) · [`2026-09-19-evidence-runner-and-model-lease.md`](2026-09-19-evidence-runner-and-model-lease.md) | The September release-gaps plans | **Read §3: their ✅/❌ statuses describe `upstream/fix/v0.1.0-release-gaps`, not this fork** |

## 2 · Studio tool↔GUI build — what shipped, what remains

Promised: +20 panels over the 57 baseline (ledger in MASTER-IMPL §5). Shipped: **all 20
capabilities**, 18 under the promised ids and 2 under other homes — `canon-growth` → panel
`flywheel`, `world` → `world-setup` + the `/worlds` page. `catalog.ts` holds **97 panel ids**
today (the rest came from later plans). Spot checks with evidence paths are in the per-wave
`RECONCILED 2026-11-24` blocks of the RUN-STATE file.

Still open from that program:

1. **Spec-16 retirement (finish-line node ②)** — `frontend/src/pages/ChapterEditorPage.tsx`
   is still on the tree, blocked on `D-STUDIO-MOBILE-SHELL` (no mobile editing surface in the
   Studio; a PO decision).
2. **Session leftovers** — `S2-B2e` (arc-templates live-browser smoke + `/review-impl`),
   `S4` rows `3b`/`3c` (motif binding-lens smoke + conformance panel smoke — the panels and
   code exist; the *live-browser smoke evidence* does not), `S8 §2` (translation
   agent-parity/responsive/scale/User-Guide bar, marked `PARTIAL`).
3. The defer register (MASTER-IMPL §7.2, 67 rows) — decisions with triggers, not work items.

## 3 · September release-gaps — merged 2026-11-24; what remains open

`2026-09-18-close-v010-leftovers.md` and `2026-09-19-evidence-runner-and-model-lease.md`
were written on `upstream/fix/v0.1.0-release-gaps` — a branch **148 commits ahead of
`upstream/main`** (2026-09-13 → 2026-09-19).

> **✅ MERGED onto fork main on 2026-11-24** (`a9026c82d` + repairs `50abf0ce9`, `4636e70f3`,
> `bdf05e62f`, `23e80cc5d`, `177c2434b`). The plan files in THIS folder are now the branch's
> full versions — their `[x]` rows and AC statuses are true of THIS tree. What remains genuinely
> open from the two plans:
>
> - **runner plan `T8` / AC-6** — `#288` (DEFERRED `#165`) is decided only by 5 consecutive
>   clean full runs in `frontend/tests/e2e/runs/LEDGER.jsonl`; the merged ledger carries the
>   branch's runs, and the count continues on THIS fork's stack from here.
> - **runner plan `T17` / AC-12** — the full suite through `scripts/e2e/run-evidence-suite.py`
>   on rebuilt images has not been run on the fork stack yet.
> - ~~leftovers plan `T11`~~ — **DONE post-merge**: the branch `auth.tsx` auto-merged, so
>   `provisionOnSignIn` is wired at sign-in (`auth.tsx:90`, once per sign-in, never per
>   refresh); its unit test is green on this tree. The 298-half-provisioned-books backfill
>   this was built for now runs on this deployment at every sign-in.
> - The leftovers plan's AC-11 (ship GO/NO-GO) stays the PO's, as the plan itself states.

Everything else the branch delivered — provision-at-creation + provision-missing endpoints
(`composition_provision.go`, `provision_missing.go`), `why-red.py`,
`evidence-capture-gate.py`, the e2e `tsconfig.json` / `typecheck:e2e` gate,
`RetiredChapterEditorRedirect.tsx`, and the full September plan versions — is on this tree
and covered by the gates. Game-track code branches (`mmo-rpg/*` code, `on-prem` runtime)
remain deliberately unmerged — see §5.

## 4 · The eras (for archaeology)

| Era | Plans | What they were |
|---|---|---|
| 2026-05 | 87 | geo/tilemap/world-gen simulation, flatworld, first MVP plans (much of the geo/tilemap code later moved to the game track) |
| 2026-06 | 241 | knowledge-service hierarchical extraction, lore-enrichment, eval framework |
| 2026-07 | 125 | the Writing Studio program (specs 29–38, waves, sessions, track C) |
| 2026-08 | 42 | game-tier substrate, data plane, reality layer, gate-teeth |
| 2026-09 | 22 | v0.1.0 release: go-live, ship acceptance, release gaps, human-sim, branch merges |
| undated | `assets/` + `studio-adjudication/` | images + the adjudication register |

Sub-foldered programs: `2026-05-29-foundation-mega-task/` (26 docs, the L1–L7 foundation
cycles), `2026-05-30-lore-enrichment/`, `2026-06-03-enrichment-closure/`,
`2026-06-13-creation-unblock/`, `2026-06-26-motif-library-ws/`,
`2026-07-02-agent-extensibility-registry/`, `studio-adjudication/`.

## 5 · Upstream branch accumulation (2026-11-24)

The fork's main accumulated every upstream branch carrying unmerged work:

| Upstream branch | Outcome |
|---|---|
| `fix/v0.1.0-release-gaps` (148 commits — the September release-gaps program, §3 above) | **MERGED** (`a9026c82d` + repairs `50abf0ce9`, `4636e70f3`) |
| `dependabot/github_actions/actions-all` · `go_modules/piikms go-minor-patch` · `npm_and_yarn/npm-minor-patch` | **MERGED** (`4b09f241e`, `ff057d392`, `85768db37`; frontend kept its own vite-8 package.json) |
| `civ-layer-amaw` (world-gen civilization layer, TextProvider + civ_adapter split) | **MERGED** (`ebe13b9a9`; `cargo check -p world-gen` green) |
| dependabot waves 2026-11-27: 5× `python-json-logger` (2.0→4.1/4.2), `json-repair` (→0.63.4), 3× `jsdom` (29→30.1.3), 10× cargo majors (tonic/tonic-build 0.14.9, redis 1.8.3, sha2 0.11, hmac 0.13, jsonwebtoken 11+aws_lc_rs, rand/rand_chacha/rand_core 0.10) | **MERGED** (rounds 1–3, 2026-11-27; workspace port: RngExt/Rng trait moves, tonic-prost-build+tonic-prost split, single prost 0.14.6 node, hmac KeyInit; suites green — world-gen 452, tilemap 333, dp-kernel 469, chat repair 120) |
| dependabot `mcp 2.0.0` ×4 (infra/chat/knowledge/sdks-python) | **NOT MERGED — deliberate.** mcp 2.0.0 removed `mcp.server.fastmcp`; the composition/jobs/knowledge MCP servers run on FastMCP and `sdks/python/pyproject.toml` documents the `<2` upper bound as load-bearing. |
| dependabot `typescript 7.0.2` ×6 (frontend + 5 gateways) | **NOT MERGED — deliberate.** ts-jest 29 and @nestjs/cli 12 do not support the TS 7 (Go-native) line; cms-frontend and poc/tilemap_world_view already run ^7.0.2 as the pilot. |
| dependabot `datasets 5.0.1` (knowledge) | **Already applied** (fork raised knowledge to `datasets==5.0.1` in the 2026-10-24 wave) |

| `mmo-rpg/zone-map-quality-spec` · `zone-map-v3-spec` (ADRs + plans) | **MERGED** (docs) |
| `feat/glossary-extracting-assistant` (specs; fork copies were newer and kept) | **MERGED** (`2b2c2a4f8`) |
| `mmo-rpg/zone-role-viz` (zone-role overlay: viewer-store + canvas overlay + panels + registry validation) | **DOCS merged (`d57485f16`); the CODE needs file-level re-integration** — a blind union against the fork's shipped TMP-Q4/Q3 polish (treasure bands, smooth blend) breaks JSX in `LayerToggles`/`MetadataPanel` and splices `assert!` blocks in `http_integration.rs`. The feature is self-contained (11 files, both-sides additions in the same Polish subsection); re-integrate per file, keeping both feature families. |
| `mmo-rpg/decoration-family-splits` (game CODE, 76 files) | **NOT MERGED — deliberate.** Same May-era game-track caveat; its docs (`2026-05-30-decoration-family-splits-*.md`, `2026-05-30-zone-role-viz-chunk-*.md`) are merged via the same docs-only merge. |
| `feat/on-prem-single-port` (runtime code) | **NOT MERGED — deliberate** (precedent `b28f71b4c`: assets were taken, the runtime code predates the fork divergence). Its `nginx.prod.conf` + deploy-assessment doc were already taken then. |
| everything else (`release/v0.1.0`, `feat/frontend-tools-mcp-migration`, `feat/game-logic`, `refactor/*`, `feature/human-sim-remediation`, stale dependabot) | ahead=0 of upstream/main — already on the fork via upstream syncs; the stale dependabot bases are superseded by the fork's own dep management. |

## 6 · House rules

- New dated plans in this folder need a `Reconciles:` line (enforced by
  `scripts/phase0-reconcile-gate.py` for files dated ≥ 2026-08-06).
- Added lines must be ENGLISH (`scripts/doc-language-gate.py`, added-lines-only).
- `stale-deferral-gate` / `discharged-deferral-gate` parse `docs/plans/*.md` for deferral
  registries — do not edit registered blocks without running them.
- Decision records (adjudication, FINAL-REPORTs) are evidence: append a dated note, never
  rewrite their lines.
