---
name: git-sync
description: >-
  Safely synchronize the CynoPlanning local Git repo with GitHub: backup-commit
  local work, pull with rebase when possible, stop clearly on conflicts, then
  push — never force-push or hard-reset. Use when the user asks to sync, pull
  from GitHub, synchronize local and remote, run git:sync, or update the project
  without losing local changes.
---

# CynoPlanning Git sync

## Run this (preferred)

```bash
npm run git:sync
```

Equivalent:

```bash
bash scripts/git-sync.sh
```

Requires `git_write` + network (or `all`) permissions in Cursor sandboxes.

## Workflow (do not improvise)

1. **Checking repository...** — verify Git repo, branch, remote; refuse detached HEAD / in-progress merge/rebase.
2. **Local changes detected.** — if dirty or untracked (non-ignored), stage with `git add -A`.
3. **Creating backup commit...** — commit with message `chore(sync): local backup <timestamp>`.
4. **Pulling latest updates...** — `git fetch --prune`; then FF, or `git pull --rebase` when diverged.
5. **Merging changes...** — rebase preferred; non-conflicting changes apply automatically.
6. On **conflict** — stop, list conflicting files, leave the repo as-is (no abort that discards work, no force). Tell the user to resolve, `git add`, `git rebase --continue` (or finish merge), then re-run `npm run git:sync`.
7. **Pushing to GitHub...** — normal `git push` only.
8. **Synchronization completed successfully.**

## Hard rules

- Never `git push --force`, `--force-with-lease`, `reset --hard`, or `clean -fd` as part of sync.
- Never delete or overwrite local work to “make pull work”.
- Never rewrite published history (Lovable-connected project).
- Preserve full Git history.

## After conflicts

Print conflicting paths from `git diff --name-only --diff-filter=U` and instruct the user. Do not auto-resolve content conflicts.
