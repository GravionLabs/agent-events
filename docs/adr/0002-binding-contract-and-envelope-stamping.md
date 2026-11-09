# ADR 0002: Binding contract and envelope stamping

- Status: Proposed
- Date: 2026-11-09
- Related: [ADR 0001](0001-general-core-with-profiles-and-bindings.md), [bindings/jsonl-file.md](../../bindings/jsonl-file.md), [bindings/mcp.md](../../bindings/mcp.md)

## Context

ADR 0001 separates the core (the format) from bindings (transport and location). agent-events is meant to be independent of the harness (Claude Code, Codex, a pwsh script, a CI job), of the workflow or skill that writes it (deliver is one of many) and of the transport: a JSON Lines file is one option, a stream such as an MCP server, stdout or SSE must be possible without a change in the core.

A review of `v0.1.0` against that goal found that the file still shapes the core:

- **Framing in the core.** SPEC.md speaks of lines and files: `run` is "equal on every line of the file", "lines that are not JSON are skipped", "a line MUST NOT exceed 16384 bytes". The schema describes itself as "one line of a run file" and `runId` as "also the file name". The validator splits text into lines and requires one run per input.
- **Liveness tied to silence.** `abandoned` is "no `run.finished` and the last event older than one hour". A step that runs longer than an hour without an event looks abandoned; in a stream, silence means nothing. It is also open whether `abandoned` is final.
- **The producer counts.** The core assumes that whoever emits an event also sets `v`, `seq`, `ts` and `run`. When an agent reports through a tool call (MCP), the model emits the event and cannot be trusted to count `seq` gaplessly.
- **One writer per run is a binding rule.** Only `jsonl-file` says "one writer process tree", although gapless `seq` needs exactly one sequencer per run in every binding. Subagents in their own harness processes therefore cannot write into their parent's run, and the core has no way to relate two runs (`task.parent` groups tasks inside one run only).
- **No binding contract.** `jsonl-file` answers framing, discovery, replay, liveness and retention, but nothing says which questions every binding MUST answer. Ordering and delivery guarantees (dedupe by `(run, seq)`, which the fold already does) are implicit.
- **Run ids collide across hosts.** `r1` is fine in a directory per repository, not in a stream that carries runs of many hosts.
- **Tone without a profile is unguided.** The core defines the values of `tone` but no default for core types, so two writers without a profile colour the same situation differently, and displays must not derive tone.
- **Non-goals are implicit.** There is no back channel (a human answers `needsYou` elsewhere), and ordering is by `seq`, never by `ts`, but neither is written down.
- **deliver remnants.** The main writer fixture `full-run.jsonl` declares `deliver@1`; the README introduces `Report-Progress.ps1`, poimen and herdr as *the* writer and readers.
- **Versions are confusing.** Events carry `v: 1`, the schema lives under `schema/v0/`, the package is `0.1.0`.

## Decision

### The core is transport-free

The core speaks of **events**, never of lines or files.

- An event is one JSON object. Its UTF-8 serialization MUST NOT exceed 16384 bytes. A binding maps this to its framing (a line, an SSE event, an MCP message).
- `run` is equal on every event of a run. How runs are separated (a file per run, a field in a multiplexed stream) is binding matter.
- What a reader does with a frame that is not a JSON object is binding matter; the core fold starts from parsed events. `jsonl-file` keeps "skip lines that are not JSON".
- Schema descriptions and `$defs` lose every reference to files and lines; the `run` pattern stays because bindings may use it as a name.

### Producer, writer and envelope stamping

- A **producer** emits the body of an event: `type`, `tone`, `needsYou` and the type's fields.
- The **writer** of a run is the single component that sequences its events. It owns the **envelope**: `v`, `seq`, `ts`, `run`.
- Producer and writer MAY be the same process (a script that appends to a file). They MAY be different: an agent calls an MCP tool, and the server stamps the envelope.
- A binding states where the writer sits and which envelope fields a producer may omit. A writer MUST reject an event whose producer-supplied `seq` or `run` conflicts with its own; it MAY fill `ts` when the producer leaves it out.
- **One writer per run** is a core rule: every run has exactly one writer at a time, so that `seq` is gapless. Several producers MAY feed one writer.

### Related runs

`run.started` gets an optional `parent`: `{run, task}` (`task` optional), pointing at the run (and task) that spawned this one. A subagent in its own process writes its own run with `parent` set instead of writing into its parent's run. The fold of each run is unchanged; a display MAY nest child runs under their parent. A reader that does not know the parent shows the run on its own.

### Liveness

- New core type `run.heartbeat` with no fields beyond the envelope (tone `neutral`). It only updates `updated` in the state. A writer SHOULD emit one at least every 15 minutes while a run is running and nothing else is emitted.
- `abandoned` stays a judgment of the reader at its clock: no `run.finished` and no event for longer than the **stale time**. The core default is one hour; a binding MAY shorten it or add signals (the `jsonl-file` writer pid, a closed MCP session).
- `abandoned` is not final. An event that arrives later folds normally and the run is `running` again. Only `run.finished` ends a run.

### Ordering and delivery

- Within a run, events are ordered by `seq`. `ts` is informational and never used for ordering; clocks of writer and reader may differ.
- Between runs there is no order.
- A binding MAY deliver an event more than once. Readers deduplicate by `(run, seq)`; the fold already ignores `seq` not above the last folded one.
- A binding MUST NOT reorder events of one run, or it MUST let a reader restore the order by `seq` before folding.

### Run ids

`run` SHOULD be unique across hosts and time: a ULID or UUIDv7 is recommended. A binding that carries runs of several hosts in one stream (MCP, SSE) MUST either require unique ids or qualify them (for example by session).

### Binding contract

Every binding is a document in `bindings/` with these sections. Each section answers the question for that binding, or says it does not apply.

| Section | Question |
| :-- | :-- |
| Framing | How is one event delimited? What happens to a frame that is not a JSON object, or is incomplete? |
| Writer | Where does the writer sit? Which envelope fields may a producer omit? How is "one writer per run" ensured? |
| Discovery | How does a reader list runs and learn about new ones? |
| Replay and resume | How does a reader get all events of a run, and how does it continue after `seq` N? Is a state snapshot offered? |
| Follow | How does a reader learn about new events (polling, subscription, push)? |
| Delivery | Ordering, duplicates, loss. |
| Liveness | Stale time and additional signals for `abandoned`. |
| Retention | Who deletes what, when. |
| Limits | Maximum event size (at most the core limit), rate limits. |
| Access | Authentication, who may read and write which runs. |

The abstract reader operations behind the contract are: **list runs**, **read a run from `seq` N**, **follow a run**. Every binding maps them.

### Tone defaults

The core gets a SHOULD table of default tones for core types, used when no profile says otherwise. `tone` stays required on every event, so an event never depends on a default the reader must know.

| Event | Default tone |
| :-- | :-- |
| `run.started`, `task.started`, `step.started`, `progress`, `attention.resolved`, `run.heartbeat` | `neutral` |
| `step.finished` | `neutral`, or `success` when it completes the task's last step |
| `task.finished` | `succeeded` → `success`, `failed` → `danger`, `cancelled` → `warning`, `skipped` → `neutral` |
| `run.finished` | `succeeded` → `success`, `failed` → `danger`, `cancelled` → `warning` |
| `attention` | `warning`; `danger` when the run cannot continue |

### Non-goals

Written down in SPEC.md:

- No back channel. `needsYou` signals; the answer happens elsewhere, reached through `links`. Elicitation (MCP or otherwise) is out of scope.
- No content. Unchanged from the security section: no prompts, model output or secrets.
- No telemetry. Durations, token counts and costs belong to OpenTelemetry GenAI, not here.

### Conformance per role

| Role | Checked by |
| :-- | :-- |
| writer | `fixtures/events/` (core schema plus envelope rules) |
| reader | `fixtures/state/` (fold) |
| binding | `fixtures/bindings/<binding>/` (framing, discovery, resume, duplicates) |

New: `fixtures/streams/` with multiplexed streams (NDJSON, several runs interleaved, duplicates, a resume point), and a validator mode `agent-events validate --stream` that groups events by `run` before applying the per-run rules.

### Independence of the repository

- `fixtures/events/valid/full-run.jsonl` declares `example@1` instead of `deliver@1`; one valid fixture declares no profile at all.
- The README names writers and readers as examples, not as the parts of the system.

### Second binding

`bindings/mcp.md` (draft) is the second binding and the first stream binding. It proves the contract with two directions: agents write through a tool, readers read through subscribed resources. It is written against the contract above and does not change the core.

## Open questions

- **Version naming.** Either `v` becomes `0` during 0.x and `schema/v<v>/` follows `v`, or `v` stays `1`, the first release of `1.0.0` publishes `schema/v1/`, and `schema/v0/` is documented as "format 1, pre-release". Decide before `v0.2.0`.
- **Heartbeat interval.** 15 minutes against a one-hour stale time leaves room for three missed heartbeats; whether a binding may announce its own interval in `host` (`jsonl-file.heartbeat`) is open.
- **Child runs in the fold.** Whether the run state lists known child runs (needs a reader to see several runs) or this stays a display feature.

## Consequences

- Easier:
  - An MCP server, a CLI on stdout or an SSE endpoint can carry agent-events without a change in the core, and an agent can report through a tool without counting `seq`.
  - Long steps no longer look abandoned, and an abandoned run that wakes up recovers.
  - Subagents in separate processes become visible as related runs.
  - Two writers without a profile colour the same situation alike.
  - A new binding knows which questions it has to answer.
- Harder:
  - SPEC.md, both schemas and the validator are reworded and partly restructured; `jsonl-file` takes over the framing rules.
  - One more core type (`run.heartbeat`) and one more `run.started` field (`parent`), each with fixtures; the fold gets the rule "a later event revives an abandoned run".
  - Writers in GravionLabs/skills and the readers in poimen and herdr-plugins adopt heartbeat and the revived `abandoned`.
  - A third fixture set (bindings) to maintain.
- Follow-ups: core rewording without lines and files, `run.heartbeat` and `run.started.parent` with schema and fixtures, fold rule for revived runs, tone default table, non-goals in SPEC.md, `--stream` validator mode with `fixtures/streams/`, `jsonl-file` restructured along the contract, `full-run.jsonl` on `example@1`, README wording, `bindings/mcp.md` from draft to accepted after a prototype, then `v0.2.0`.

## Alternatives

- **Keep framing rules in the core.** Simpler to read for the file case, but every stream binding would have to explain how a "line" maps to it.
- **Producers always stamp the envelope.** No writer concept, but agents that report through tools would have to keep a counter across tool calls; a missed or repeated call breaks `seq`.
- **Several writers per run with per-writer sequences** (`seq` per producer, vector clocks). Allows subagents in one run, but every reader would need a merge rule. Related runs are simpler and keep one gapless `seq`.
- **Liveness only in bindings, no heartbeat type.** A purer core, but every binding would invent its own keep-alive, and a file has none.
- **`tone` optional with default `neutral`.** Shorter events, but a reader would need the default table to colour a run; the core keeps tone explicit.
- **MCP progress notifications as the stream binding.** Built in, but bound to one request with a `progressToken`: they end with the request, carry only progress and a message, and cannot be replayed by a second client.
- **AG-UI or A2A task updates as the transport.** Existing streams, but each brings its own event model; a binding to them can still be written later on top of this contract.
