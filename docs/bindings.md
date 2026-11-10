# Writing a binding

The core ([SPEC.md](../SPEC.md)) is the format. A **binding** carries it over a transport: a file, a stream, a tool call. This page says what a binding has to answer. The contract is [ADR 0004](adr/0004-binding-contract-and-envelope-stamping.md), status Proposed: until it is accepted, treat the rules below as the current draft, not as final. The key words MUST, SHOULD and MAY are used as in RFC 2119.

A binding is one document in `bindings/`. It does not change the core. If a question does not apply to the transport, the binding says so instead of leaving the section out.

## Roles

- A **producer** emits the body of an event: `type`, `tone`, `needsYou` and the fields of the type.
- The **writer** of a run is the single component that sequences its events and owns the **envelope** (`v`, `seq`, `ts`, `run`). Producer and writer may be one process (a script that appends to a file) or two (an agent calls an MCP tool, the server stamps the envelope).
- A **reader** replays and follows the events and folds them into the run state. Readers never write.

Every run has exactly one writer at a time, so that `seq` is gapless. Several producers MAY feed one writer. A subagent in its own process writes its own run, with `parent` set in `run.started`, instead of writing into its parent's run.

## The contract

Each section below is a heading of the binding document. It answers the question for that binding.

| Section | Question | `jsonl-file` | `mcp` (draft) |
| :-- | :-- | :-- | :-- |
| Framing | How is one event delimited? What happens to a frame that is not a JSON object, or is incomplete? | one event per line ended by `\n`; incomplete last line is skipped until its newline arrives; lines that are not JSON are skipped | one event per tool call (write) or per element of `events` (read); an invalid event is a tool error and nothing is stored |
| Writer | Where does the writer sit? Which envelope fields may a producer omit? How is one writer per run ensured? | the producing process itself, which sets the whole envelope; one writer process tree per file | the server; producer omits `v`, `seq`, `ts`; `run` is created on `run.started` and sent otherwise |
| Discovery | How does a reader list runs and learn about new ones? | list `<dir>/*.jsonl`; the file name is the run id | resource `agent-events://runs`, with `list_changed` and `updated` notifications |
| Replay and resume | How does a reader get all events and continue after `seq` N? Is a snapshot offered? | read the file from the start; resume by remembering the last `seq`; no snapshot (fold it yourself) | `agent-events://runs/{run}/events{?after}`; a state snapshot at `…/state` |
| Follow | How does a reader learn about new events? | read on past the end of the file (poll or file watch) | subscribe to the events resource, then read with `after`; poll without subscription support |
| Delivery | Ordering, duplicates, loss. | append order is `seq` order | `seq` order within a run; duplicates possible, no loss of accepted events |
| Liveness | Stale time and extra signals for `abandoned`. | one hour of file age, or the writer pid is gone | one hour, or the session that started the run ended |
| Retention | Who deletes what, when. | writers delete finished or abandoned runs after 7 days, keep at most 100 files | the server, server-defined |
| Limits | Maximum event size, rate limits. | 16384 bytes per line | 16384 bytes per event, server-defined rate limit |
| Access | Authentication, who may read and write which runs. | file system permissions | the MCP transport, plus server policy |

The abstract reader operations behind the contract are **list runs**, **read a run from `seq` N** and **follow a run**. Every binding maps all three.

## Rules every binding keeps

These come from the core and ADR 0004; a binding states how it meets them, it does not choose whether to.

- An event serializes to at most 16384 bytes of UTF-8. A binding MAY set a lower limit, never a higher one.
- `run` is equal on every event of a run. Run ids SHOULD be unique across hosts and time (ULID or UUIDv7). A binding that carries runs of several hosts in one stream MUST require unique ids or qualify them.
- A writer MUST reject an event whose producer-supplied `seq` or `run` conflicts with its own. It MAY fill `ts` when the producer leaves it out.
- Within a run events are ordered by `seq`, never by `ts`. Between runs there is no order. A binding MUST NOT reorder the events of a run, or it MUST let a reader restore the order by `seq`.
- A binding MAY deliver an event more than once. Readers deduplicate by `(run, seq)`; the fold already ignores a `seq` that is not above the last folded one.
- `abandoned` is a judgment of the reader at its clock, not final: a later event revives the run. Only `run.finished` ends it. The core default stale time is one hour; a binding MAY shorten it or add signals. A writer SHOULD emit `run.heartbeat` at least every 15 minutes while a run is running and nothing else is emitted.
- There is no back channel: `needsYou` signals, the answer happens elsewhere.

## Worked example: jsonl-file

[bindings/jsonl-file.md](../bindings/jsonl-file.md) is the file binding, and the simplest case: producer and writer are the same process.

- Framing: one file per run, `<run>.jsonl`, one event per line, appended in a single write, so a reader never sees half an event unless the writer died mid-write.
- Writer: the process sets `v`, `seq`, `ts` and `run` itself. `seq` is the number of lines plus one. Because the file has one writer process tree, no lock is needed.
- Discovery, replay, follow: a reader lists the directory, reads a file from the start and keeps reading from where it stopped. Resume after `seq` N means skipping the events up to N.
- Liveness: the writer records `jsonl-file.pid` in `host`; a run is `abandoned` when that process is gone or the file did not change for an hour.
- Retention and location: the writer prunes old runs; the directory is `<git-common-dir>/.agents/events/`, or `AGENT_EVENTS_DIR`.

[Getting started](getting-started.md) has runnable writers and a reader for this binding.

## Worked example: mcp (draft)

[bindings/mcp.md](../bindings/mcp.md) is the second binding and the first stream binding. Its status is draft; the tool and resource names are not final.

- Producer and writer are different: the agent calls the tool `agent_events_start` once (the server creates the run id) and `agent_events_emit` for every other event. The server stamps the envelope and serializes the events of a run, so the model never counts `seq`.
- A retry after a timeout is made safe by an optional `idempotencyKey`.
- Readers list runs through one resource, read `…/events?after=N` to replay and resume, and subscribe to be told about new events. The notification carries no event; the reader reads again.
- Liveness adds a signal that a file does not have: the session that started the run ended.

Open in the draft, so not yet part of the contract: a push variant that carries events in the notification, batch emit, and the binding fixtures under `fixtures/bindings/mcp/`.

## Checking a binding

ADR 0004 plans a fixture set per binding (`fixtures/bindings/<binding>/`: framing, discovery, resume, duplicates) and a `validate --stream` mode. Neither exists yet. Until then a binding is checked by the writer fixtures in `fixtures/events/` (what it writes) and the state fixtures in `fixtures/state/` (what a reader folds from it).
