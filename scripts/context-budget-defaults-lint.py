#!/usr/bin/env python3
"""context-budget-defaults-lint.py — enforce Context Budget Law OUT-2 defaults, cross-service.

Spec: docs/standards/mcp-tool-io.md · OUT-2 ("Default to the smaller shape").

The RUNTIME size gate (loreweave_mcp Tool.run → _check_size) already WARNS when a tool
result crosses 8 KB — but a warning nobody acts on is not protection (jobs_list warned
`bytes=52351` on every default call for weeks; K36). This is the static teeth: it makes
the *defaults* that produce those payloads a CI/pre-commit failure, so a LIST-returning
MCP tool cannot ship (or regress back to) a context-crowding default.

THE RULE — a tool whose signature has BOTH a `detail` selector AND a `limit` param is a
LIST tool (returns many rich rows). Its DEFAULTS must be the small shape:
  1. `detail` defaults to "summary"  (drop each row's heavy fields; full is opt-in)
  2. `limit`  defaults to <= LIMIT_CEIL rows  (a page the caller's context can hold)
Both compound — jobs_list at detail=full × limit=50 was 45.6 KB; summary × 10 is 4.5 KB.

A single-item tool (has `detail`, no `limit`) is EXEMPT — `full` for one object is fine.

Named limit defaults (`limit=KG_GRAPH_LIMIT_DEFAULT`) are resolved from a `NAME = <int>`
assignment in the SAME file; an unresolvable name is reported (not silently passed).

Deliberate exemptions live in ALLOW below with a reason. The current offenders are seeded
as tracked DEBT (K37) — each is a FLIP-PENDING follow-up (drop it from ALLOW when the tool
is migrated to summary + a small limit, K36-style, with its own by-effect test).

Usage:
  python scripts/context-budget-defaults-lint.py            # full scan (CI / manual)
  python scripts/context-budget-defaults-lint.py --staged   # only git-staged files
Exit 0 = clean. Exit 1 = a LIST tool defaults to a context-crowding shape.
"""
from __future__ import annotations

import ast
import os
import subprocess
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# A default page a caller's context can comfortably hold. jobs_list uses 10; 25 is the
# generous ceiling (a genuinely list-heavy tool may justify more via an ALLOW reason).
LIMIT_CEIL = 25

# service::tool -> reason. Seeded with the OUT-2 offenders found on 2026-07-24 (K37), each a
# FLIP-PENDING debt: migrate the tool to summary + a small limit (K36-style) then delete its
# row. A NEW list tool must comply or earn an explicit reason here (a reviewer will ask why).
ALLOW: dict[str, str] = {
    "knowledge-service::kg_entity_edge_timeline": "K37 FLIP-PENDING — detail=full default",
    "knowledge-service::kg_graph_query": "K37 FLIP-PENDING — detail=full default",
    "knowledge-service::kg_multi_query": "K37 FLIP-PENDING — detail=full + limit=200",
    "knowledge-service::kg_triage_list": "K37 FLIP-PENDING — detail=full default",
    "knowledge-service::kg_world_query": "K37 FLIP-PENDING — detail=full + limit=200",
    "knowledge-service::memory_search": "K37 FLIP-PENDING — detail=full default",
    "knowledge-service::memory_timeline": "K37 FLIP-PENDING — detail=full default",
    "knowledge-service::story_search": "K37 FLIP-PENDING — detail=full default",
    "composition-service::composition_arc_suggest": "K37 FLIP-PENDING — detail=full default",
    "composition-service::composition_list_outline": "K37 FLIP-PENDING — detail=full default",
    "composition-service::composition_motif_book_list": "K37 FLIP-PENDING — detail=full + limit=50",
    "composition-service::composition_motif_suggest_for_chapter": "K37 FLIP-PENDING — detail=full default",
    "translation-service::translation_job_status": "K37 FLIP-PENDING — detail=full default",
    "translation-service::translation_list_versions": "K37 FLIP-PENDING — detail=full default",
}


def _service_of(path: str) -> str:
    parts = path.replace("\\", "/").split("/")
    return parts[parts.index("services") + 1] if "services" in parts else "?"


def _resolve_int(name: str, module_ints: dict[str, int]) -> int | None:
    return module_ints.get(name)


def _default_map(fn: ast.AST) -> dict[str, ast.expr]:
    """param-name -> default AST node (positional tail + kwonly)."""
    args = fn.args
    out: dict[str, ast.expr] = {}
    pos = args.args
    off = len(pos) - len(args.defaults)
    for i, a in enumerate(pos):
        if i >= off:
            out[a.arg] = args.defaults[i - off]
    for a, d in zip(args.kwonlyargs, args.kw_defaults):
        if d is not None:
            out[a.arg] = d
    return out


def scan_file(path: str) -> list[str]:
    try:
        src = open(path, encoding="utf-8").read()
        tree = ast.parse(src)
    except (OSError, SyntaxError):
        return []
    # module-level int constants for named-limit resolution
    module_ints: dict[str, int] = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, int):
            for t in node.targets:
                if isinstance(t, ast.Name):
                    module_ints[t.id] = node.value.value
    svc = _service_of(path)
    problems: list[str] = []
    for fn in ast.walk(tree):
        if not isinstance(fn, (ast.AsyncFunctionDef, ast.FunctionDef)):
            continue
        params = {a.arg for a in fn.args.args + fn.args.kwonlyargs}
        if "detail" not in params or "limit" not in params:
            continue  # not a LIST detail-tool
        key = f"{svc}::{fn.name}"
        if key in ALLOW:
            continue
        defaults = _default_map(fn)
        det_node = defaults.get("detail")
        det = det_node.value if isinstance(det_node, ast.Constant) else None
        if det != "summary":
            problems.append(
                f"  {key}: detail defaults to {det!r} — a LIST tool must default detail=\"summary\" "
                f"(OUT-2). {path}:{fn.lineno}"
            )
        lim_node = defaults.get("limit")
        lim = None
        if isinstance(lim_node, ast.Constant) and isinstance(lim_node.value, int):
            lim = lim_node.value
        elif isinstance(lim_node, ast.Name):
            lim = _resolve_int(lim_node.id, module_ints)
            if lim is None:
                problems.append(
                    f"  {key}: limit default `{lim_node.id}` could not be resolved to an int in-file "
                    f"— cannot verify it's <= {LIMIT_CEIL}. {path}:{fn.lineno}"
                )
        if isinstance(lim, int) and lim > LIMIT_CEIL:
            problems.append(
                f"  {key}: limit defaults to {lim} (> {LIMIT_CEIL}) — a default page that big crowds "
                f"the caller's context (OUT-2). {path}:{fn.lineno}"
            )
    return problems


def iter_files(staged: bool) -> list[str]:
    if staged:
        out = subprocess.run(
            ["git", "diff", "--cached", "--name-only", "--diff-filter=ACM"],
            cwd=REPO_ROOT, capture_output=True, text=True,
        ).stdout.split()
        return [os.path.join(REPO_ROOT, f) for f in out if "/mcp/" in f.replace("\\", "/") and f.endswith(".py")]
    files = []
    for root, _dirs, names in os.walk(os.path.join(REPO_ROOT, "services")):
        r = root.replace("\\", "/")
        if "/mcp" not in r or "__pycache__" in r:
            continue
        files.extend(os.path.join(root, n) for n in names if n.endswith(".py"))
    return files


def main() -> int:
    staged = "--staged" in sys.argv
    problems: list[str] = []
    for f in iter_files(staged):
        problems.extend(scan_file(f))
    if problems:
        print("✗ context-budget-defaults-lint: LIST tool(s) default to a context-crowding shape:\n")
        print("\n".join(problems))
        print(
            "\nFix: default `detail=\"summary\"` and `limit <= %d`; `detail=\"full\"` / a larger limit are "
            "explicit opt-ins the caller narrows UP to (OUT-2). A deliberate exemption gets a row in "
            "ALLOW with a reason." % LIMIT_CEIL
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
