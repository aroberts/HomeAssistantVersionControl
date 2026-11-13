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

---

## Review 2026-11-13

**Checked range:** `2d211bd` → `a892b99` (current `saihgupr/main` HEAD)

**Total commits inspected:** 82 (many merges, release bumps and README/GIF churn)

### Taken — on `main`

| Upstream | Fork commit | Notes |
| --- | --- | --- |
| `c26463a` | `e53e9cf` | **Bugfix.** `restoreScript` read/wrote an undefined `fullPath`; script restore was broken in the fork. Clean pick; logging converted. |
| `0293244` (logging) + `e8bc137` (regex) | `5930102` | **Security.** `maskUrl()` applied to remote URLs logged at init (info level) and in the cloud-sync settings handler; request-body debug log no longer includes `authToken`. |
| `d9462df` (exclusion block only) + `73d0b56` (normalization) | `f338c9f` | **Gap from last review.** `ac88ed6` (c59bf09) relied on a user-exclusion check in `shouldIgnoreWatchPath()` that upstream added in the manual-mode commit we declined. Without it `exclude_files` entries still triggered git ops. |
| `d743b53` | `576c633` | **Bugfix.** `add-all-and-commit` filters via `shouldIgnoreWatchPath()` + `git check-ignore`. Deviation: check-ignore args batched (500) to avoid argv limits. |
| `4a2d0c7` (server only) | `0807781` | `triggerAutoPushIfConfigured()` extracted; `add-all-and-commit` now pushes on `every_commit`. Passes `authUser`. Client-side hunks skipped (tied to upstream settings UI). |
| `3b8d7f5` | `d53942b` | Sort dropdown visibility. Clean pick. |
| `4233c03` (map + prefix only) | `a9f0868` | `all_addon_configs:rw` map and `/addon_configs` allowed prefix. Manual-mode guards skipped. |
| `76ead90` | `0fd8bf5` | List env vars `INCLUDE_EXTENSIONS`, `EXCLUDE_FILES`, `INCLUDE_STORAGE`, `ADDITIONAL_PATHS`. Adapted: nested env map like cloudSync, `_FILE` support, empty list rejected. |
| `ffaa463` | `9e67a9f` | Arrow direction (◀ = older by default). Hard-coded `v1.2.2` header badge dropped. |
| `0e88abf` | `aaab3f3` | `legacyArrowDirection` runtime setting + `LEGACY_ARROW_DIRECTION`. **Add-on option not taken**: upstream declares it required with default `false` and applies it every init, which resets the UI toggle on restart. |
| `68704a0` | `af1c69d` | Removes arrow explanation text. Clean pick. |
| `0293244` (DATA_DIR) | `e29455b` | `DATA_PATH` env overrides `/data`. Needed by the test harness. |
| `5ffaf19` | `a556bc9` | **Auto-reload changed components.** Adapted: runs `checkHomeAssistantConfig()` first and skips reload when invalid (matches `2fad7ce` pull pipeline); `auto_reload` is schema-only in `config.json` so it overrides the UI only when explicitly set; restore-suppression window scales with debounce. Test ported with an invalid-config case; `npm test` now runs `tests/*.test.mjs`. HA Tweaks footer link skipped. |

### Taken — on branch `upstream-git-hardening` (pending merge)

| Upstream | Notes |
| --- | --- |
| `73d0b56` (gitExec mutex only) | Write queue in `gitExec`. Deviation: read-only subcommands bypass the queue with `GIT_OPTIONAL_LOCKS=0`, so UI reads aren't blocked behind push/pull. 40 concurrent `git add`: 24 lock failures before, 0 after. |
| `b225524`, `e8bc137`, `d8266ae` | `http.<url>.extraHeader` auth, embedded-credential extraction, SSH-origin preservation. Adapted for `authUser`; embedded URL creds keep precedence; init and `/api/cloud-sync/test` now pass `authUser` (previously dropped). Header lives in `.git/config`, so not at-rest protection. Upstream e2e test ported (`CLOUD_SYNC_BRANCH=main`) plus an authUser case. |

### Declined — features

| Commits | Why |
| --- | --- |
| `57bc3e5`, `dac5400`, `95cfcff`, manual-mode parts of `4233c03`, `b225524` commit-manual hunk | Manual mode follow-ups; manual mode itself still declined. |
| `610b64a`, `2336f75` | Secondary mirror remote (#55). ~570 lines, heavy conflict with fork's cloud-sync rewrite. Revisit if redundant off-site copies are wanted. |
| `3897df7`…`6268e82`, `09f94c6`, `decf9bf`, `5d555d9` | Mobile layout + instant-save settings. 600+ lines of UI churn. |
| `73d0b56` (rest) | `exclude_folders`, configurable polling, dir-watch instead of glob: optional. Add-on list options switched from replace to union-merge, which makes defaults impossible to remove — not taken. |
| `5bab6b5` | Auto-create GitHub repo on push. GitHub-OAuth-specific. |
| `fbd57e8` | GitHub avatar link fix. Only relevant to GitHub provider. |
| `a55af78`, `7b8e6eb`, `97e4d9e` | Confetti upgrade, GitHub/donation footer links. |
| `4f74a89` | Push-frequency reset on settings load — depends on upstream's instant-save UI refactor. Revisit with mobile/instant-save. |

### Declined — copy / version / CI churn

`10ffde9` (fixes upstream-only regression from `73d0b56`), `b36c6a8` (superseded by `d743b53`), `ac9baee`, `9d0ea79`, `462a83a`, `e031a15`, `8e92b1f`, `c0ab5d6`, `dc86d6b`, `f04cae4`, `8401f8c`, `2d05a6a`, `421ca46`, `35948f6`, `4f10ce7`, all README/screenshot/GIF/badge commits, `0913002` + CI part of `95cfcff` (fork has its own pipeline), `737ccd1`/`79ee6a8` (upstream test flake fixes), merges.

### Conflict notes

- `0e88abf` and `5ffaf19` conflict across `server.js`, `app.js`, `index.html`, `config.json` because upstream's surrounding code assumes manual mode (`autoSave` toggle, `manualMode` setting). Hand-ported instead of picked.
- Upstream add-on options with defaults in `options` (e.g. `legacy_arrow_direction`, `auto_reload`) get applied on every init and override runtime-settings. Prefer schema-only (`bool?`) entries when porting.
- `app.js` has two `renderDiff` declarations (pre-existing); harmless as a classic script but `node --check` fails under `"type": "module"`.

**Checked up to: `a892b99` (Use the new version history recording in the README, 2026-11-12)**
