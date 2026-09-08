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

`scripts/apply-defect.mjs` edits the working tree to introduce a real defect,
then puts it back:

```bash
npm run break product-bug     # edit app/server.mjs
npm test                      # watch it fail
npm run break -- --reset      # restore

npm run break flaky,test-bug  # several at once
```

The app and specs contain no defect switchboard — nothing conditional on an env
var — so the failing code the agent reads looks like an ordinary mistake. Reset
restores from a backup under `.defect-backup/`, not from git, so it never
disturbs your other working-tree changes.

| Defect | What the script changes | Correct verdict |
|---|---|---|
| *(none)* | — | suite passes |
| `product-bug` | `summarize()` counts outstanding todos while the wording still says "done" | **product-bug** → `app/server.mjs` |
| `test-bug` | spec expects the label "Add task"; the app says "Add todo" | **test-bug** → `tests/todo.spec.ts` |
| `flaky` | `GET /api/todos` sleeps 0–1500ms against a 700ms assertion budget | **flaky** |
| `timeout` | toggle mutates state and never sends a response | **timeout / product-bug** (hung request) |
| `infra` | a missing `DATABASE_URL` check exits 1 on boot | **infra** — suite never ran |

That table is your answer key. Run a scenario, read the agent's verdict, compare.

## Running the agent

The agent runs on Claude via **Microsoft Foundry**, authenticated with a Foundry
API key (no Azure OIDC, no `ANTHROPIC_API_KEY`).

1. In the [Foundry portal](https://ai.azure.com/), open your resource →
   **Endpoints and keys** → copy the **API Key**, and note the resource name and
   your Claude deployment names.
2. In the repo, under Settings → Secrets and variables → Actions:

   | Kind | Name | Value |
   |---|---|---|
   | Secret | `ANTHROPIC_FOUNDRY_API_KEY` | the Foundry API key |
   | Variable | `ANTHROPIC_FOUNDRY_RESOURCE` | the resource name (the `{resource}` in `https://{resource}.services.ai.azure.com`) |
   | Variable | `CLAUDE_MODEL` | your Claude deployment name, e.g. `claude-opus-4-8` |

   `CLAUDE_MODEL` is not optional in practice. On Foundry the `opus`/`sonnet`
   aliases resolve to Claude Code's built-in default (Opus 4.6) and there is no
   startup model check, so if that deployment doesn't exist in your resource the
   run fails on the first request. Pin it to a deployment you actually have.
3. Actions → **E2E + AI Triage** → *Run workflow*, and put a scenario in the
   `break` input — the workflow applies it with `apply-defect.mjs` after
   checkout. Or open a PR that genuinely breaks something.

The workflow passes `github_token: ${{ github.token }}` to the action, which
skips the Claude Code GitHub App token exchange — without it the step 401s with
"Claude Code is not installed on this repository". Installing the
[Claude Code GitHub App](https://github.com/apps/claude) instead of passing the
token also works, and is the better choice if you later want `@claude` mentions
or agent-authored commits.

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

**Known limitation:** `scripts/apply-defect.mjs` still holds the recipes, so an
agent that goes looking could read the answers there. Nothing points it at that
file — the failing code explains itself — but if you want a guaranteed leak-free
evaluation, commit real defects on scenario branches instead.

This mattered in practice. The first graded run used an env-var switchboard
inside `app/server.mjs`, and the agent classified the failure correctly but
blamed the `BREAK` branch it found nearby — a branch that wasn't even executing
— and proposed a fix that would have changed nothing. Defect-shaped code in the
source distorts the result.

## Layout

```
app/server.mjs          Express server (no defect logic)
app/public/index.html   UI
tests/todo.spec.ts      6 specs
playwright.config.ts    boots the server, 1 retry, JSON+HTML reporters
scripts/apply-defect.mjs      injects/restores defects
scripts/condense-report.mjs
.github/triage-prompt.md
.github/workflows/e2e-triage.yml
docs/superpowers/specs/  design spec
```
