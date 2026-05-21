# Upstream Review Log

Periodic audits of [`saihgupr/main`](https://github.com/saihgupr/HomeAssistantVersionControl) to decide which upstream commits to pull into this fork. New reviews are appended below.

## How to run a review

1. `git fetch saihgupr`
2. Find the previous **Checked up to** commit in the log below.
3. `git log --reverse --format="%h %ad %s" --date=short <prev_commit>..saihgupr/main` — chronological list of new upstream commits.
4. For each commit, classify by intent:
   - **Bug fix** affecting code we still have → strong candidate to take
   - **Feature** → judgment call; weigh against fork goals in `FORK_GOALS.md`
   - **Infra/packaging** (Dockerfile, build.yaml, config.json) → take if it improves distribution
   - **Version bumps / changelog / readme copy** → skip; we manage our own
5. Inspect substantive commits with `git show <hash>` before classifying.
6. Before cherry-picking: `git merge-tree --write-tree --name-only main saihgupr/main` to preview conflicts.
7. Cherry-pick with `-x` so the commit message records the upstream hash. Resolve conflicts by preserving fork-specific conventions (structured logging via `log.xxx()`, security validation, etc.).
8. Append a new review section here ending with **Checked up to: `<commit>`**.

### Classification rubric

A commit is worth taking if it satisfies one of:
- Fixes a bug in code that's still present in our fork (grep the relevant symbol/path to confirm).
- Improves packaging in a way that broadens HA compatibility (multi-arch, Supervisor compatibility, OCI labels).
- Adds a self-contained endpoint or UI that doesn't conflict with fork goals.

Skip:
- Version-string bumps in `config.json` / `package.json` (we don't track upstream versions).
- Changelog or README copy describing upstream features that don't apply to us — we have `FORK_GOALS.md`.
- Cache-busting `<script src="app.js?v=...">` query-string churn.
- Commits whose intent is already implemented or superseded in the fork.

Always grep the fork for the affected symbol/file before deciding — upstream often re-touches code we've already replaced.

---

## Review 2026-05-21

**Checked range:** `b009220` (tip of last merge, 21c5583 from 2026-04-04) → `2d211bd` (current `saihgupr/main` HEAD)

**Total commits inspected:** 20 (18 non-merge)

### Taken

| Commit    | Why                                                                                                                                                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `c59bf09` | **Bugfix.** Watcher event handler invoked git operations on files matched by exclusion rules, causing `index.lock` errors and CPU spikes (upstream issue #29). Fix calls `shouldIgnoreWatchPath()` at the start of the handler and proactively `watcher.unwatch()`s excluded paths. |
| `5d371c0` | **Bugfix.** Removing a `.storage` pattern from `include_storage` left previously-tracked files in the index. Fix walks `git ls-files .storage/` and `git rm --cached`s anything that no longer matches `isConfiguredStorageRepoPath()`. Required a manual conflict resolution to retain fork's `log.xxx()` calls. |
| `2d211bd` | **Packaging.** Flips `supported: true` in `config.json` (enables the HA "supported" badge) and relocates loose `test-*.{html,mjs}` into `tests/`. Trivial. Followed with a local commit moving our `test-bench-ai-commit.js` + `test/diffs/` into the same `tests/` directory for consistency. |

### Declined — features (judgment call; defer to a later review if user interest changes)

| Commits                                                                | Feature                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `d9462df`, `3e6e0a1`, `dd8801f`, `458b937`, `92b3f8f`, `2236529`       | **Manual Mode / Auto Save toggle.** Opt-in mode that disables watcher, startup commit, `.gitignore` write, and global git config. Adds a "Backup Now" sidebar button and `POST /api/git/commit-manual`. UI was renamed mid-stream from "Manual Mode Only" → "Auto Save" (inverted semantics). ~250 server lines + UI. Useful but invasive; revisit if a user asks for it. |
| `7b6ab93`, `92b3f8f` (dialog refinement)                               | **Flush repository button.** `POST /api/git/flush` runs `git reflog expire --expire=now --all` then `git gc --prune=now --aggressive` (5min timeout) with a modal-confirm UI. Self-contained — easy to take in isolation. Deferred only because we weren't asked for it this round.                  |

### Declined — packaging (deferred; useful when we want broader distribution)

| Commits   | Why now                                                                                                                                                                                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `8086e4c` | **Multi-arch `build.yaml`.** Re-enables aarch64/armhf/armv7/i386. Required if we ever want this fork installable on Pi/ARM HA. Not needed if we only ever consume it ourselves on amd64.                                                                                       |
| `83164a0` | **`BUILD_FROM` default → `home-assistant/base:latest`.** Compatibility fix for Supervisor 2026.04.0+. Important if we ever publish images via Supervisor; not blocking otherwise.                                                                                              |
| `7b88f0a` | **Dockerfile OCI + `io.hass.*` labels.** Improves how images render in HA UI. Trivial to take but no current user impact.                                                                                                                                                       |
| `4159240` | **Default `BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest`.** Superseded by `83164a0`; skip standalone, take only as a transitive dependency.                                                                                                                              |

### Declined — copy / version churn

| Commits                       | Why                                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `3ae6d8a`, `1acb250`          | Version-string bumps (`1.2.1`, `1.2.2`). We don't track upstream version strings.                                    |
| `bcef53d`, `af8b628`          | CHANGELOG / README copy describing upstream features. Not applicable — see `FORK_GOALS.md`.                          |
| `83c834c`, `ca28bc4`          | Merge commits — no standalone content.                                                                               |

### Conflict notes

- Only `server.js` conflicted on the dry-run merge (`public/app.js` and `public/css/style.css` auto-merge). Of the three taken, only `5d371c0` required hand-resolution — the fix's `console.log` calls had to be rewritten to use our `log.info` / `log.warn` / `log.debug` per `FORK_GOALS.md` Goal 2.
- Source of conflict: our `2fad7ce` (3-phase pull pipeline) and the `f169064` (structured logging) commit both touch the runtime-settings POST handler. Future cherry-picks in that region will likely need similar manual resolution.

**Checked up to: `2d211bd` (cleanup root and enable supported badge, 2026-05-04)**
