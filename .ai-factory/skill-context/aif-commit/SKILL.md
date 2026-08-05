# LoreWeave overrides for `aif-commit`

Read [`.ai-factory/skill-context/aif/SKILL.md`](../aif/SKILL.md) first. This file covers only committing.

## Never bypass the hooks

`.githooks/pre-commit` runs the workflow gate plus the provider-rule, DB-safety, closed-set,
doc-language, deferral, gate-wiring and agent-skills-parity checks. Enable them once per
checkout:

```bash
git config core.hooksPath .githooks
```

A blocked commit is the system working. **Do not pass `--no-verify`**, and do not "fix" a
gate by weakening it — a check that cannot fail is worse than no check.

## Commit and push the primary branch

This fork commits and pushes only to `main`; do not create or push feature or secondary branches.
`git.skip_push_after_commit: false` preserves the push prompt after a successful commit. Once the
required verification and review gates are complete, push `main` to the configured SSH `origin`.

## What goes in a commit

- **Stage only the files you changed** — never `git add -A`.
- The message names the phase and the review fixes, and is **English**, like every other
  persisted artifact here. So is the PR body.
- The `SESSION_HANDOFF.md` update lands in the **same commit** as the code it describes.
  Work not recorded there does not exist for the next session.

## Before the commit exists

COMMIT is phase 11 of 12. VERIFY (6), REVIEW (7), QC (8), POST-REVIEW (9) and SESSION (10)
come first, and POST-REVIEW is a human checkpoint that is never skippable. The workflow gate
enforces this; do not route around it by committing from a different tool.
