<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## User data — do not delete

**NEVER** run `rm -rf` (or equivalent) on:

- `~/Library/Application Support/CynoPlanning` (macOS packaged app userData)
- `%APPDATA%\CynoPlanning` (Windows)
- Any Electron `userData` path for this app (dev may use `~/Library/Application Support/Electron`)

That folder holds `cynoplanning.db`, WAL sidecars, `media/`, and `auth-session.json`. Deleting it permanently destroys local operational data. Prefer timestamped copies (`cynoplanning.db.pre-migration.*.bak`) or moving the folder aside — never silent delete.

Before any migration or data reset that writes/clears SQLite, create a timestamped backup of the live DB. For non-interactive CI that must create a missing empty DB, set `CYNOPLANNING_ALLOW_EMPTY_DB=1`.
