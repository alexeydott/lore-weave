# Project Rules

> Short, actionable rules and conventions for this project. Loaded automatically by `$aif-implement`.

## Rules

- Track only the `.ai-factory/` files present in `upstream/main`; keep all other AI Factory working files ignored and never persist credentials, local endpoints, account details, database or model IDs, private keys, or filled-in environment files.
- Always push this project to the primary branch (`main`); do not push to feature or secondary branches.
- Never add a `Co-authored-by` trailer to commit messages.
- Always use the SSH remote `git@github.com:alexeydott/lore-weave.git` as `origin` for this project; do not replace it with an HTTPS remote.
