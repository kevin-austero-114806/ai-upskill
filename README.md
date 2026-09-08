# ai-upskill — AI test failure triage harness

A deliberately breakable Node + Playwright app whose CI pipeline calls an AI
triage agent when tests fail. The app is not the point: it's a controlled
environment where every failure has a known correct classification, so you can
grade the agent's triage quality.

## Quick start

```bash
npm ci
npx playwright install --with-deps chromium
npm test          # all green
```

## Breaking things on purpose

`BREAK` is a comma-separated env var read by both the server and the specs.

```bash
BREAK=product-bug npm test
BREAK=flaky,test-bug npm test
```

| `BREAK` value | Injected defect | Correct verdict |
|---|---|---|
| *(unset)* | — | suite passes |
| `product-bug` | `summary` counts every todo as done | **product-bug** → `app/server.mjs` |
| `test-bug` | spec expects the label "Add task"; the app says "Add todo" | **test-bug** → `tests/todo.spec.ts` |
| `flaky` | `GET /api/todos` sleeps 0–1500ms against a 700ms assertion budget | **flaky** |
| `timeout` | toggle endpoint accepts the request and never responds | **timeout / product-bug** (hung request) |
| `infra` | server exits 1 on boot | **infra** — suite never ran |

That table is your answer key. Run a scenario, read the agent's verdict, compare.

## Running the agent

1. Add `ANTHROPIC_API_KEY` to the repo's Actions secrets.
2. Actions → **E2E + AI Triage** → *Run workflow*, and put a scenario in the
   `break` input. Or open a PR that genuinely breaks something.

The workflow:

1. runs Playwright with `continue-on-error`, JSON reporter → `test-results/report.json`
2. `scripts/condense-report.mjs` distills that into `triage-input.md` — titles,
   file:line, error text, code frames, per-attempt outcomes
3. on failure, `anthropics/claude-code-action` follows `.github/triage-prompt.md`:
   read the input, read the source, classify each failure, write `triage-verdict.md`
4. the verdict is posted as a PR comment (PR runs) and to the job summary (always)
5. report, traces and both markdown files are uploaded as artifacts

Triage problems never mask the test result — the job still fails on red, and a
missing verdict falls back to dumping the raw failure input into the summary.

## Iterating on the agent

The prompt is the product here. Edit `.github/triage-prompt.md` and re-dispatch
the same scenario to compare verdicts. To iterate without burning CI runs, run a
scenario locally, `node scripts/condense-report.mjs`, then hand the resulting
`triage-input.md` to Claude Code with the same prompt.

**Known limitation:** the agent can read the `BREAK` branches in `app/server.mjs`
and `tests/todo.spec.ts`, so a determined agent can find the seams. It still has
to map each failure to the right cause, but if you want a leak-free evaluation,
commit real defects on scenario branches instead of using the switchboard.

## Layout

```
app/server.mjs          Express server + defect injection
app/public/index.html   UI
tests/todo.spec.ts      6 specs
playwright.config.ts    boots the server, 1 retry, JSON+HTML reporters
scripts/condense-report.mjs
.github/triage-prompt.md
.github/workflows/e2e-triage.yml
docs/superpowers/specs/  design spec
```
