# agent-events specification, v1

The key words MUST, SHOULD and MAY are used as in RFC 2119.

## Model

A **run** is one execution of an agent workflow (a loop, an interactive session). It writes **events** to an append-only **run file**. The **state** of a run is the fold of its events. Writers never keep state that readers need; readers never write.

## Run file

- JSON Lines, UTF-8, one event per line, named `<run>.jsonl`.
- Default location `<git-common-dir>/.agents/events/` (`git rev-parse --git-common-dir`, the same from every worktree), not committed. `AGENT_EVENTS_DIR` overrides it.
- A run has exactly one writer process tree. Lines are appended whole. A reader MUST skip an incomplete last line.
- A reader replays the file from the start and then follows it.

## Event

Schema: [`schema/progress-event.schema.json`](schema/progress-event.schema.json).

Every event has `v` (1), `seq` (per run, starting at 1, gapless), `ts` (RFC 3339), `run`, `type` and `tone`.

| `type` | Carries |
| :-- | :-- |
| `run.started` | `source` (`loop` or `session`), `harness`, `model`, `repository`, `milestone` (`key`, `title`, `url`), `pid`, `host` (`poimenTerminal`, `herdrPane`) |
| `milestone.progress` | `closed`, `total` |
| `issue.started` | `issue` (`number`, `title`, `url`) |
| `step.finished` | `issue`, `step` (`name`, `n`, `total`, `text`), `prUrl` |
| `attention` | `issue`, `kind` (`pr_opened`, `review_fix`, `ci_red`, `paused`, `blocked`, `needs_you`, `release_test`), `reason`, `needsYou` |
| `issue.finished` | `issue`, `outcome` (`delivered`, `blocked`, `paused`, `skipped`) |
| `release.updated` | release state, `reviewRound`, `rcUrl`, `rcVersion`, `testIssue` |
| `run.finished` | `result` (`done`, `max reached`, `blocked`, `no progress`, …) |

The event vocabulary is borrowed from AG-UI. agent-events describes domain progress (issue, step, result, PR, milestone), which AG-UI, ACP, A2A, MCP progress notifications and OpenTelemetry GenAI do not.

## Tone

`tone` is `neutral`, `info`, `success`, `warning` or `danger`. The **writer** decides it once; each display maps it to its own palette and MUST NOT derive it again. Colour codes never appear in an event.

| Event | Tone |
| :-- | :-- |
| `attention` `pr_opened` | success |
| `attention` `review_fix`, `paused`, `needs_you`, `release_test` | warning |
| `attention` `ci_red`, `blocked` | danger |
| `step.finished` step `done`, `pr`, `merge`, `merged` | success |
| `step.finished` step `review` with a result containing "fix" | warning |
| `step.finished` step `ci` with a result matching red or fail | danger |
| `step.finished` step or result `paused` / `blocked` | warning / danger |
| `issue.finished` `delivered` / `paused` / `blocked` / `skipped` | success / warning / danger / neutral |
| `run.finished` `done` / `no progress` / `blocked` / other | success / warning / danger / neutral |
| every other event | neutral |

`needs_you` and `release_test` also set `needsYou: true`.

## Projection

The fold of a run is described by [`schema/deliver-run-state.schema.json`](schema/deliver-run-state.schema.json); its `description` holds the folding rules. A reducer is correct when, for every `fixtures/<case>.jsonl`, it produces `fixtures/<case>.state.json`.

## Lifecycle

- `run.finished` closes a run.
- A run without `run.finished` whose `pid` no longer lives, or whose file has not changed for one hour, is `abandoned`.
- A writer MAY delete finished and abandoned runs older than 7 days and keep at most the last 100. Readers never delete.

## Compatibility

- Fields are only ever added. A reader ignores unknown fields and unknown event types.
- A change in the meaning of an existing field or type bumps `v`.
- A new event type or tone rule comes with a fixture.
- Releases are git tags (`v1.x.y`). Consumers pin a tag.
