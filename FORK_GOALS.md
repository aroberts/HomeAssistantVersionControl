# Fork Goals

This document describes what this fork changes relative to [upstream](https://github.com/saihgupr/HomeAssistantVersionControl) and why.

## Goal 1: AI-Generated Commit Messages

**Problem:** Upstream generates commit messages from filenames (e.g., `automations.yaml`) or file counts (`3 files`). These are useless for understanding *what* changed when scanning the timeline.

**What we added:**
- `utils/ai-commit.js` — OpenAI-compatible chat completion client that sends diffs to any `/v1/chat/completions` endpoint and extracts a commit message
- Default prompt requesting subject+body format (subject max 72 chars, body with context)
- Thinking model support: strips `<think>` blocks, falls back to Ollama `reasoning` field
- Graceful degradation: if AI is disabled, unconfigured, or fails, the original filename-based message is used
- Environment variables: `AI_GENERATE_COMMIT_MESSAGES`, `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`, `AI_PROMPT`
- All AI env vars support Docker secrets via `_FILE` suffix
- Frontend: `classifyCommitMessage()` distinguishes AI descriptions from filename messages; AI messages render italic with body shown on hover
- Test tooling: `test-bench-ai-commit.js` benchmarks all installed Ollama models against 7 sample HA config diffs

**Commits:** `6141f34`, `d92114b`, `9621b03`, `de34623`, `94e5910`, `e996a49`

## Goal 2: Structured Logging

**Problem:** Upstream uses raw `console.log`/`console.error` everywhere. In a containerized HA addon, this makes logs noisy and impossible to filter. Operational chatter (file watcher events, cache refreshes) drowns out important events (commits, errors, restores).

**What we added:**
- `utils/log.js` — level-gated logger (`error`, `warn`, `info`, `debug`) controlled by `LOG_LEVEL` env var
- Every `console.log/error/warn` call across server.js, automation-parser.js, git.js, ai-commit.js, metrics.js, and validate.js replaced with appropriate `log.xxx()` calls
- Noisy messages (watcher events, cache, retention details) → `debug`
- Key lifecycle events (startup, commits, restores, push/pull) → `info`
- Default level: `info`

**Commits:** `f169064`

## Goal 3: Security Hardening

**Problem:** Upstream had several security issues:
- No path traversal protection on file-reading API endpoints
- No commit hash validation (allows git argument injection)
- CORS allowed any origin via naive string matching (`origin.includes('172.')` matches `evil172.com`)
- Auth tokens returned in plaintext via settings API
- Settings file stored world-readable on disk
- Unused API key accepted but served no purpose

**What we added:**
- `utils/validate.js` — `safePath()` (resolve + prefix check, blocks null bytes and `../`), `isValidCommitHash()` (4-40 hex chars), `isAllowedOrigin()` (proper IPv4 octet parsing for RFC 1918 ranges)
- `redactSettings()` — strips `authToken`, masks embedded credentials in URLs before API responses
- `chmod 0600` on `runtime-settings.json` (with CIFS fallback)
- Removed the vestigial API key check that added no security value
- Applied `safePath` to all file-access endpoints, `isValidCommitHash` to all commit-hash endpoints

**Commits:** `3952f16`, `149ea4f`, `b93071b`

## Goal 4: Operational Metrics

**Problem:** No visibility into the addon's runtime behavior — push/pull success rates, commit volume, watcher health, retention cleanup performance.

**What we added:**
- `utils/metrics.js` — lightweight Prometheus-compatible metrics (Counter, Gauge, Histogram) with no external dependencies
- Defined metrics: push/pull totals and durations, auto-commit count, lines added/removed, watcher status, retention cleanup, AI failures, repo size, process uptime
- `GET /metrics` endpoint for scraping
- Git query cache with 60s TTL for repo stats

**Commits:** `3952f16`, `6141f34`

## Goal 5: Cloud Sync Enhancements

**Problem:** Upstream only supports push-to-remote. Multi-instance setups (e.g., staging + production HA) need pull support. Branch is hardcoded. Non-GitHub remotes (Gitea, generic Git servers) need HTTP Basic Auth.

**What we added:**
- `pullFromRemote()` with configurable rebase/merge strategy
- `pullBeforePush` option to auto-pull before each push
- Configurable remote branch via `CLOUD_SYNC_BRANCH` (default: `develop`)
- `authUser` field for HTTP Basic Auth (user:token) on non-GitHub remotes
- Pull metrics and error classification
- `/api/cloud-sync/pull` endpoint
- All cloud sync env vars support Docker secrets via `_FILE` suffix
- Remote URL credential redaction in all log output

**Commits:** `6141f34`, `b93071b`

## Goal 6: Docker Secrets Support

**Problem:** Upstream requires all sensitive values (tokens, API keys) as plain environment variables. Docker Swarm and Kubernetes users need to use secret files.

**What we added:**
- `FILE_ENV_ALLOWLIST` — scoped allowlist of env var names that support the `_FILE` suffix pattern
- On startup, reads `FOO_FILE` → loads file contents into `FOO` for all allowlisted vars
- Covers: `SUPERVISOR_TOKEN`, `AI_API_KEY`, `CLOUD_SYNC_AUTH_TOKEN`, and all other app env vars

**Commits:** `3952f16`, `6141f34`

## Goal 7: CI/CD

**Problem:** Upstream workflow only builds on tagged releases.

**What we added:**
- Build and publish on push to main (not just tags)
- Flexible workflow triggers

**Commits:** `c31210a`, `0a51f39`

---

## Merge Status (2026-04-04)

Merged upstream `saihgupr/main` into this fork. The merge brought in:
- Max commits toggle, confetti mode, adjustable side panels, theme cycling
- `.storage` file tracking, additional path tracking (`/share`, `/media`)
- Smart SSH key loader, CA certificate integration, `ignoreSslErrors` option
- `git init -b main`, preserve existing git identity, `git rm` for newly excluded files
- GitHub issue templates, various UI fixes

**All fork goals verified intact after merge.** Upstream's removal of our security, logging, metrics, and AI utilities was correctly handled by git (our modifications took precedence over their deletions). All `console.log` calls from upstream's new code (SSH, CA certs, external path sync) were converted to structured `log.xxx()` calls post-merge.
