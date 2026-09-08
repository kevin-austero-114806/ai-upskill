# AI Test Failure Triage Agent — Test Harness

**Date:** 2026-09-08
**Status:** Approved

## Purpose

Provide a deliberately breakable Node + Playwright app whose CI pipeline invokes an
AI triage agent on test failure. The point is not the app: it is a controlled
environment where each failure has a known correct classification, so the agent's
triage quality can be graded.

## Success criteria

- `npm test` passes with no `BREAK` flag set.
- Each `BREAK` value produces exactly the failure kind named in the table below.
- On a failing PR, the agent posts a single comment classifying every failure.
- The agent's classification can be compared against the ground-truth table.

## Architecture

Single repo, no database, no external services.

```
app/server.mjs          Express server, in-memory todo store, defect injection
app/public/index.html   UI (add / toggle / counter)
tests/todo.spec.ts      ~6 specs
playwright.config.ts    webServer boots app/server.mjs, 1 retry
scripts/condense-report.mjs   report.json -> triage-input.md
.github/workflows/e2e-triage.yml
```

### App surface

- `GET  /`            static UI
- `GET  /api/todos`   `{ todos: [{id, text, done}], summary: "N of M done" }`
- `POST /api/todos`   `{ text }` -> created todo
- `POST /api/todos/:id/toggle` -> updated todo
- `POST /api/reset`   clears store (test isolation)

The counter string is computed server-side so a product bug is observable through
the API as well as the UI.

## Failure switchboard

`BREAK` is a comma-separated env var read by **both** `app/server.mjs` and
`tests/todo.spec.ts`. Empty/unset means everything green.

| Value | Injected defect | Ground-truth classification |
|---|---|---|
| `product-bug` | `summary` counts all todos as done | Product bug, root cause `app/server.mjs` |
| `test-bug` | Spec asserts button label "Add task" (app says "Add todo") | Test bug, app is correct |
| `flaky` | `GET /api/todos` sleeps random 0-1500ms | Flaky / timing-sensitive; passes on retry |
| `timeout` | Toggle endpoint never responds | Timeout, hung request, not an assertion failure |
| `infra` | Server exits 1 during boot | Infra, suite never ran |

Values may be combined (`BREAK=product-bug,flaky`).

## Pipeline

`.github/workflows/e2e-triage.yml`

Triggers: `pull_request`, and `workflow_dispatch` with a `break` string input.

Steps:
1. Checkout, setup Node, `npm ci`, `npx playwright install --with-deps chromium`.
2. Run Playwright with JSON reporter to `test-results/report.json`,
   `continue-on-error: true`, `BREAK` from the dispatch input (empty on PR runs
   unless the PR itself is broken).
3. `node scripts/condense-report.mjs` -> `triage-input.md`. Per failure: title,
   spec file and line, error message, code frame, retry outcomes, plus a run-level
   note when zero tests executed (the infra case). Output capped to keep the agent
   prompt small.
4. If step 2 failed: run `anthropics/claude-code-action` with a triage prompt that
   reads `triage-input.md`, reads the relevant source files, and emits one verdict
   per failure: classification (product-bug | test-bug | flaky | infra),
   confidence, suspected file:line, one-line reasoning, suggested next action.
   Destination is a PR comment when `github.event_name == 'pull_request'`,
   otherwise `$GITHUB_STEP_SUMMARY`.
5. Always upload `test-results/` (report, traces) as an artifact.

Permissions: `contents: read`, `pull-requests: write`, `actions: read`.

The agent authenticates to Claude through Microsoft Foundry with an API key
(`use_foundry: true`, `CLAUDE_CODE_USE_FOUNDRY=1`, `ANTHROPIC_FOUNDRY_API_KEY`
secret, `ANTHROPIC_FOUNDRY_RESOURCE` variable). No Azure OIDC, so no
`id-token: write`. The model must be pinned to an existing Foundry deployment
via the `CLAUDE_MODEL` variable — Foundry has no startup model check and the
built-in alias default may not exist in the resource.

## Error handling

- Triage failure (missing key, API error) must not mask the test result: the job's
  final status reflects the tests, and triage problems surface as a warning in the
  log plus a note in the summary.
- `condense-report.mjs` tolerates a missing or malformed `report.json` and emits a
  minimal "no report produced" input rather than crashing.

## Testing

- Local: run `npm test` for each `BREAK` value and confirm the observed failure
  matches the table, and that `triage-input.md` contains the distinguishing signal.
- CI: one `workflow_dispatch` run per scenario; compare the agent verdict against
  the ground-truth column.

## Out of scope

Auto-filed issues, auto-fix PRs, multiple browsers, persistence, auth.
