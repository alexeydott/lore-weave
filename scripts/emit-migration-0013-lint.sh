#!/usr/bin/env bash
# emit-migration-0013-lint.sh — drift guard for the W3.4 content checksum.
#
# The Go emit path (tests/workload-gen `-emit`, emit.go insertEventsSQL) and the
# dp-kernel append BOTH stamp events.content_sha256 with the migration-0013
# column. A drill that builds its OWN per-reality events DB and then runs `wg
# -emit` MUST therefore apply 0013_events_content_sha256, or the INSERT fails on
# the missing column. This guard flags any script that:
#
#   (a) sets up its own events baseline  (mentions `0002_events_table`), AND
#   (b) invokes the wg emit path         (a ` -emit` flag — leading space so the
#                                         pgbench file `scale-emit.sql` etc. do
#                                         NOT false-match), BUT
#   (c) does NOT apply `0013_events_content_sha256`.
#
# Scripts that rely on `scale-rig.sh migrate` (no own 0002) are NOT flagged — the
# rig's migrate path already applies 0013. Scripts that emit via raw pgbench (no
# ` -emit` wg flag) are NOT flagged — they don't reference content_sha256.
#
# Exit 0 = clean; 1 = an emit script missing 0013; 2 = misuse / selftest failure.

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"

# violates TEXT — 0 = own-baseline emit script missing 0013, 1 = clean.
# With pipefail, `printf '%s' "$text" | grep -q ...` is NOT a safe predicate:
# grep can match an early line and exit 0 before printf finishes, giving printf
# SIGPIPE (141) and the whole pipeline status 141. Positive checks then miss bad
# scripts; the negated 0013 check can flag good ones. This is not a command
# substitution losing output under load. Here-strings have no producer pipeline,
# so each check returns grep's own status regardless of text size or match position.
violates() {
  local text="$1"
  if grep -q '0002_events_table' <<< "$text" \
     && grep -q ' -emit' <<< "$text" \
     && ! grep -q '0013_events_content_sha256' <<< "$text"; then
    return 0
  fi
  return 1
}

run_lint() {
  local violations=0 scanned=0 f text rc
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    # Read the whole file before judging it, and distinguish read errors from
    # findings. The conditional keeps errexit from bypassing this diagnostic.
    if text=$(cat "$f"); then
      :
    else
      rc=$?
      echo "[emit-0013] FAIL — could not read $f (cat exit $rc)."
      echo "  → this is a READ failure, not a finding. Nothing about the script is implied."
      exit 1
    fi
    scanned=$((scanned + 1))
    if violates "$text"; then
      echo "[emit-0013] FAIL — $f sets up its own events baseline + runs 'wg -emit' but does NOT apply 0013_events_content_sha256"
      echo "  → add 0013_events_content_sha256 to its migration list (the emit path stamps events.content_sha256)."
      violations=$((violations + 1))
    fi
  done < <(find "$repo_root/scripts" -name '*.sh' -type f)
  if [ "$violations" -gt 0 ]; then exit 1; fi
  # scripts/ always holds shell scripts — this one among them. Zero scanned means the
  # find failed, and reporting PASS on it would certify a tree nothing looked at.
  if [ "$scanned" -eq 0 ]; then
    echo "[emit-0013] FAIL — no .sh files found under $repo_root/scripts; the scan, not the tree, is empty."
    exit 1
  fi
  echo "[emit-0013] PASS — every own-baseline emit script applies 0013 ($scanned scanned)"
}

# --selftest is the non-vacuity BITE: a synthetic bad script (own baseline + emit,
# no 0013) MUST flag; a good one (with 0013) MUST pass.
selftest() {
  local bad good padding own_position migration_position long_bad long_good i
  bad='for m in 0001_initial 0002_events_table 0005_events_outbox_table; do :; done
"$WG" -seed 1 -profile x -emit -dsn "$DSN"'
  good='for m in 0001_initial 0002_events_table 0013_events_content_sha256; do :; done
"$WG" -emit -dsn "$DSN"'
  if ! violates "$bad"; then
    echo "[emit-0013] SELFTEST FAIL — did NOT flag an own-baseline emit script missing 0013 (vacuous)"; exit 2
  fi
  if violates "$good"; then
    echo "[emit-0013] SELFTEST FAIL — flagged a script that DOES apply 0013"; exit 2
  fi
  # Put matches on separate lines around 1 MiB of padding: grep -q can stop at
  # an early line while a piped printf is still writing. Exercise both positive
  # markers early/late and 0013 early/late, including the false-positive case
  # where only the negated migration check's producer receives SIGPIPE.
  printf -v padding '%1048576s' ''
  padding=$'\n'"${padding}"$'\n'
  for own_position in early late; do
    if [ "$own_position" = early ]; then
      long_bad="${bad}"$'\n'"${padding}"
    else
      long_bad="${padding}${bad}"
    fi
    # Repeat to catch scheduling-sensitive regressions in the old pipelines.
    for i in {1..3}; do
      if ! violates "$long_bad"; then
        echo "[emit-0013] SELFTEST FAIL — long script with $own_position baseline/emit markers missing 0013 was not flagged"; exit 2
      fi
      for migration_position in early late; do
        if [ "$migration_position" = early ]; then
          long_good="0013_events_content_sha256"$'\n'"${long_bad}"
        else
          long_good="${long_bad}"$'\n'"0013_events_content_sha256"
        fi
        if violates "$long_good"; then
          echo "[emit-0013] SELFTEST FAIL — long script with $own_position baseline/emit and $migration_position 0013 was flagged"; exit 2
        fi
      done
    done
  done
  echo "[emit-0013] SELFTEST PASS — flags missing 0013, passes applied 0013 in short/long scripts with early/late markers (non-vacuous)"
}

case "${1:-}" in
  --selftest) selftest ;;
  --lint)     run_lint ;;
  "")         selftest; run_lint ;;
  *)          echo "usage: $0 [--selftest | --lint]"; exit 2 ;;
esac
