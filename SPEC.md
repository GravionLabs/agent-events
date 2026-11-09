# agent-events core specification

The key words MUST, SHOULD and MAY are used as in RFC 2119. This document is the core; see [ADR 0001](docs/adr/0001-general-core-with-profiles-and-bindings.md) for the reasons. Status: 0.x, may break.

## Model

A **run** is one execution of an agent workflow. It writes **events**, an ordered sequence of JSON objects. The **state** of a run is the fold of its events. Writers keep no state that readers need; readers never write. How events are stored, found and followed is a binding: see [bindings/jsonl-file.md](bindings/jsonl-file.md).

## Events

Schema: [`schema/v0/core.schema.json`](schema/v0/core.schema.json). Every event has:

| Field | Meaning |
| :-- | :-- |
| `v` | format major, `1` |
| `seq` | per run, from 1, gapless |
| `ts` | RFC 3339 |
| `run` | run id, equal on every line of the file |
| `type` | event type |
| `tone` | `neutral`, `info`, `success`, `warning`, `danger` |
| `needsYou` | optional boolean |

| `type` | Carries |
| :-- | :-- |
| `run.started` | `profiles` (`["<name>@<major>"]`), `host`, optional `agent` (`harness`, `model`), optional `subject` |
| `run.finished` | `outcome` (`succeeded`, `failed`, `cancelled`), optional `reason` |
| `task.started` | `task` (id, unique in the run), optional `parent` (task id), `subject` |
| `task.finished` | `task`, `outcome` (`succeeded`, `failed`, `cancelled`, `skipped`), optional `reason` |
| `step.started` | `task`, `step` (`name`, optional `n`, `total`, `text`) |
| `step.finished` | `task`, `step`, optional `links` |
| `progress` | optional `task`, `done`, `total`, optional `label` |
| `attention` | `id`, optional `task`, `reason`, `needsYou`, optional `links` |
| `attention.resolved` | `id` |

`run.started` MUST be the first event of a run and MUST occur once; a run file that starts with another event, or repeats `run.started`, is invalid.

`step.started` and `step.finished` are both optional for the writer.

## Subject and links

`subject` is `{kind, id, title, url}` (`url` optional). `kind` is free; conventional values are in [docs/subject-kinds.md](docs/subject-kinds.md), unknown kinds stay valid and are shown generically. `run.started` may carry a `subject` for the run as a whole (a milestone, a release); `progress` without `task` is the progress of that subject. `links` is a list of `{rel, url, title}` (`title` optional, `rel` free, for example `pull-request`, `log`).

## Tasks

Tasks run in parallel and are flat; `parent` only groups them. A reader lists the open tasks (started, not finished) instead of one current task.

## Attention

An `attention` is open until `attention.resolved` with its `id`, `task.finished` of its `task`, or `run.finished`. `needsYou` on it says a human must act.

## Run state

Schema: [`schema/v0/run-state.schema.json`](schema/v0/run-state.schema.json). The state is the fold of the events in order, computed by the reader. Fixtures `fixtures/state/<case>.jsonl` with the expected `<case>.state.json` are the contract; every reader, in any language, MUST produce the same state. `test/fold.ts` is the reference fold. Profiles extend the state under an object of their name.

| State field | From |
| :-- | :-- |
| `status` | `running`; `finished` after `run.finished`; `abandoned` (below) |
| `outcome`, `reason` | `run.finished` |
| `subject` | `subject` of `run.started` |
| `progress` | latest `progress` without `task`: progress of the run subject |
| `tasks` | open tasks in start order: `task`, `parent`, `subject`, last `step`, latest `progress` of the task, `links` |
| `finished` | finished tasks per `outcome` (`succeeded`, `failed`, `cancelled`, `skipped`) in finish order, with `reason` |
| `attentions` | open attentions in raise order |
| `needsYou` | true when an open attention has `needsYou` true |
| `links` | `links` of `step.finished` and `attention`, first occurrence of `rel` and `url` |
| `gaps`, `lastSeq`, `updated` | `seq` ranges missing, last `seq`, `ts` of the last folded event |

Folding rules:

- Tasks are parallel and flat. `task.started` opens a task, `task.finished` moves it to `finished`; `parent` only groups and never closes or opens anything. A repeated `task.started` for a known id, and any event for an unknown or finished task, are ignored.
- The last step of a task is the `step` of its latest `step.started` or `step.finished`.
- `progress` with a `task` belongs to that open task; without `task` it is the progress of the run subject, latest wins.
- An attention is resolved by `attention.resolved` with its `id`, by `task.finished` of its `task`, or by `run.finished` (all). A repeated `attention` for an open id and an unknown `attention.resolved` are ignored.
- Events with `seq` not above the last folded one are ignored. A jump in `seq` is not an error for a reader: the missing range is added to `gaps` and the later events are folded anyway.
- Lines that are not JSON are skipped. Unknown types (profile types too) and unknown fields are ignored, but their `seq` counts.
- `run.finished` moves every open task to `finished.cancelled` with `reason` `run finished`, in start order, after the tasks already finished; the task keeps `parent` and `subject` and loses `step` and `progress`. `tasks` is then empty.
- Nothing folds after `run.finished`.
- `abandoned` is decided by the reader: no `run.finished` and the last event older than one hour at the reader's clock (the [`jsonl-file` binding](bindings/jsonl-file.md) adds a writer `pid` that is gone). Fixtures fix the clock in `<case>.now`, default `2026-11-08T10:30:00.000Z`.

Writers SHOULD finish every task (`task.finished`) before `run.finished`, so the real outcome of each task is recorded; the fold only cancels what is left open. A validator may note open tasks at `run.finished`; the core validator does not report them as errors.

## Host

`host` of `run.started` is an open map of namespaced keys to strings (`"herdr.pane": "w1:p2"`, `"poimen.terminal": "t3"`). A key is `<namespace>.<name>`. The core names no display; each display reads its own key.

## Tone

`tone` and `needsYou` are set by the writer. A display maps tone to its palette and MUST NOT derive it again; colour codes never appear in an event. When which tone applies is a profile rule, not a core rule.

## Profiles

A profile adds types, fields, tone rules and state for one domain. Types are `<profile>.<name>` (`deliver.release.updated`); fields sit under an object of the same name (`"deliver": {...}`). A run declares its profiles in `run.started` as `<name>@<major>` (`["deliver@1"]`; name `[a-z][a-z0-9-]*`). Readers ignore profiles they do not know. Profiles live with their owner, not in this repository.

## Displays are core readers

A display MUST be able to show a run from the core alone; a profile is never required. Displays depend on agent-events only.

| Shown | From the core |
| :-- | :-- |
| what the run works on | `subject` of `run.started` |
| what is worked on now | `subject` of the open tasks |
| current step | `step.name`, `step.text` |
| pull request, log, release candidate | `links[]` (`rel`) |
| progress | `progress.done` / `progress.total` |
| colour, "needs you" | `tone`, `needsYou`, open `attention` |
| result per task and run | `outcome`, `reason` |

## Compatibility

- Fields and types are only added within a major. Readers ignore unknown fields, types and profiles (they stay valid); prefixed profile fields too.
- A change in meaning bumps `v`.
- Every new type or rule comes with a fixture in `fixtures/events/`, every fold rule with one in `fixtures/state/`.
- Fixtures: `valid/*.jsonl` MUST be accepted, `invalid/*.jsonl` MUST be rejected, one case per rule. `npm test` checks both.

## Security

- Events MUST NOT contain secrets (tokens, passwords, keys) or prompts and model output. A writer reports progress, not content.
- A line MUST NOT exceed 16384 bytes (UTF-8, without the newline). A reader MAY reject a longer line.
- `run` matches `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`: no path separators, no leading dot, no spaces, so bindings can use it as a name.
- Readers treat all text as untrusted: no markup rendering, no execution, URLs opened only by explicit user action.
