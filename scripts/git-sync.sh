#!/usr/bin/env bash
# CynoPlanning — safe Git synchronization with GitHub.
# Never force-pushes, never hard-resets, never discards local work.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REMOTE="${GIT_SYNC_REMOTE:-origin}"
# Optional: GIT_SYNC_BRANCH=main  (default: current branch's upstream short name)

say() { printf '%s\n' "$*"; }
die() { say "ERROR: $*"; exit 1; }

require_clean_git_state() {
  if [[ -d .git/rebase-merge || -d .git/rebase-apply ]]; then
    die "A rebase is already in progress. Resolve it (or abort carefully) before syncing."
  fi
  if [[ -f .git/MERGE_HEAD ]]; then
    die "A merge is already in progress. Resolve it before syncing."
  fi
  if [[ -f .git/CHERRY_PICK_HEAD ]]; then
    die "A cherry-pick is already in progress. Resolve it before syncing."
  fi
}

list_conflicted_files() {
  git diff --name-only --diff-filter=U 2>/dev/null || true
  git ls-files -u 2>/dev/null | awk '{print $4}' | sort -u || true
}

has_local_changes() {
  # Tracked modifications/deletes OR untracked (non-ignored) files.
  if ! git diff --quiet || ! git diff --cached --quiet; then
    return 0
  fi
  if [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
    return 0
  fi
  return 1
}

create_backup_commit() {
  local stamp message
  stamp="$(date '+%Y-%m-%d %H:%M:%S %z')"
  message="chore(sync): local backup ${stamp}"

  say "• Creating backup commit..."
  # Stage everything Git tracks + untracked non-ignored files (never secrets in .gitignore).
  git add -A

  if git diff --cached --quiet; then
    say "  (nothing to commit after staging — workspace already clean)"
    return 0
  fi

  # Preserve authorship; do not amend, do not skip hooks unless user set env.
  if [[ "${GIT_SYNC_NO_VERIFY:-}" == "1" ]]; then
    git commit --no-verify -m "$message"
  else
    git commit -m "$message"
  fi
  say "  Backup commit created: ${message}"
}

stop_on_conflicts() {
  local title="$1"
  local files
  files="$(list_conflicted_files | sed '/^$/d' | sort -u)"
  say ""
  say "════════════════════════════════════════════════════════════"
  say "CONFLICT: ${title}"
  say "Synchronization stopped. No code was discarded."
  say "Do NOT force-push or hard-reset. Resolve conflicts, then:"
  say "  git add <resolved-files>"
  say "  git rebase --continue   # if rebasing"
  say "  # or: git commit        # if merging"
  say "  npm run git:sync        # resume push / final sync"
  say ""
  if [[ -n "$files" ]]; then
    say "Conflicting files:"
    while IFS= read -r f; do
      [[ -n "$f" ]] && say "  • $f"
    done <<< "$files"
  else
    say "Could not list conflicted paths automatically — run: git status"
  fi
  say "════════════════════════════════════════════════════════════"
  exit 2
}

say "• Checking repository..."

command -v git >/dev/null 2>&1 || die "git is not installed or not on PATH."
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "Not inside a Git repository."

require_clean_git_state

BRANCH="$(git branch --show-current 2>/dev/null || true)"
[[ -n "$BRANCH" ]] || die "Detached HEAD — checkout a branch before syncing."

if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  die "Remote '${REMOTE}' is not configured."
fi

UPSTREAM="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
if [[ -z "$UPSTREAM" ]]; then
  # First-time branch: track REMOTE/BRANCH if it exists after fetch.
  say "  No upstream set for '${BRANCH}'. Will try ${REMOTE}/${BRANCH} after fetch."
fi

if has_local_changes; then
  say "• Local changes detected."
  create_backup_commit
else
  say "• Working tree clean (no uncommitted local changes)."
fi

say "• Pulling latest updates..."
if ! git fetch --prune "$REMOTE"; then
  die "git fetch failed. Check network / SSH / credentials for ${REMOTE}."
fi

TRACK_REF="${UPSTREAM:-}"
if [[ -z "$TRACK_REF" ]]; then
  if git show-ref --verify --quiet "refs/remotes/${REMOTE}/${BRANCH}"; then
    git branch --set-upstream-to="${REMOTE}/${BRANCH}" "$BRANCH" >/dev/null
    TRACK_REF="${REMOTE}/${BRANCH}"
    say "  Upstream set to ${TRACK_REF}"
  else
    say "  Remote branch ${REMOTE}/${BRANCH} does not exist yet — will push to create it."
  fi
fi

if [[ -n "$TRACK_REF" ]]; then
  LOCAL_SHA="$(git rev-parse HEAD)"
  REMOTE_SHA="$(git rev-parse "$TRACK_REF")"
  BASE_SHA="$(git merge-base HEAD "$TRACK_REF")"

  if [[ "$LOCAL_SHA" == "$REMOTE_SHA" ]]; then
    say "• Already up to date with ${TRACK_REF}."
  elif [[ "$LOCAL_SHA" == "$BASE_SHA" ]]; then
    # Fast-forward only (local has no unique commits).
    say "• Merging changes... (fast-forward)"
    if ! git merge --ff-only "$TRACK_REF"; then
      die "Fast-forward failed unexpectedly. Refusing destructive recovery."
    fi
  elif [[ "$REMOTE_SHA" == "$BASE_SHA" ]]; then
    say "• Local is ahead of ${TRACK_REF} — nothing to pull."
  else
    # Diverged: prefer rebase (keeps linear history when possible).
    say "• Merging changes... (rebase onto ${TRACK_REF})"
    set +e
    git pull --rebase "$REMOTE" "$BRANCH"
    pull_status=$?
    set -e
    if [[ $pull_status -ne 0 ]]; then
      if [[ -d .git/rebase-merge || -d .git/rebase-apply ]] || [[ -n "$(list_conflicted_files)" ]]; then
        stop_on_conflicts "rebase onto ${TRACK_REF}"
      fi
      # Rebase failed for another reason — try a non-destructive merge as fallback.
      say "  Rebase could not complete; trying a regular merge (no force)..."
      if [[ -d .git/rebase-merge || -d .git/rebase-apply ]]; then
        git rebase --abort || true
      fi
      set +e
      git merge --no-ff -m "chore(sync): merge ${TRACK_REF} into ${BRANCH}" "$TRACK_REF"
      merge_status=$?
      set -e
      if [[ $merge_status -ne 0 ]]; then
        stop_on_conflicts "merge ${TRACK_REF} into ${BRANCH}"
      fi
    fi
  fi
fi

say "• Pushing to GitHub..."
# Never --force / --force-with-lease. Preserve full history.
set +e
git push -u "$REMOTE" "$BRANCH"
push_status=$?
set -e
if [[ $push_status -ne 0 ]]; then
  die "git push failed. Local commits are kept. Resolve remote rejection (e.g. pull again with npm run git:sync) — never force-push."
fi

say "• Synchronization completed successfully."
say "  Branch: ${BRANCH} ↔ ${REMOTE}/${BRANCH}"
git status -sb
exit 0
