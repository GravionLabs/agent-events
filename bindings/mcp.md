# Binding: mcp (draft)

Status: draft, written against the binding contract of [ADR 0004](../docs/adr/0004-binding-contract-and-envelope-stamping.md). It does not change the core ([SPEC.md](../SPEC.md)). The key words MUST, SHOULD and MAY are used as in RFC 2119.

An **agent-events MCP server** carries runs over the [Model Context Protocol](https://modelcontextprotocol.io). It is the writer of every run it holds: agents (producers) report through tools, and readers (displays, other agents) read through resources and subscriptions. The binding is the same for every harness that speaks MCP; it does not depend on a skill or on how the server stores events.

## Framing

- One event is the JSON object in one tool call (writing) or one element of the `events` array of a resource read (reading). There are no lines.
- A tool call whose event is not a JSON object, or does not validate against the core schema (and the schemas of the run's declared profiles that the server knows), is rejected with a tool error (`isError: true`) naming the finding. Nothing is stored and no `seq` is used.

## Writer

The server is the writer of every run it holds and stamps the envelope.

| Field | Producer | Server |
| :-- | :-- | :-- |
| `v` | MAY omit | sets it |
| `seq` | MUST omit | assigns the next `seq` of the run |
| `ts` | MAY omit | sets it when omitted, at its clock |
| `run` | omits on `run.started`; MUST send it otherwise | creates it on `run.started` (ULID), checks it otherwise |

The server serializes the events of one run, so `seq` is gapless whatever the number of producers, sessions or concurrent tool calls.

### Tools

| Tool | Input | Result (`structuredContent`) |
| :-- | :-- | :-- |
| `agent_events_start` | the body of `run.started` (`profiles`, `host`, optional `agent`, `subject`, `parent`), optional `tone` | `{run, seq}` |
| `agent_events_emit` | `run` and the body of any other event (`type`, `tone`, `needsYou`, fields) | `{run, seq}` |

- `agent_events_start` exists so that a producer gets the run id before it emits anything else. `agent_events_emit` with `type: "run.started"` is rejected.
- A producer MAY retry a call that timed out. To make retries safe it MAY send an `idempotencyKey` (string, per run); the server returns the original `{run, seq}` for a repeated key instead of storing the event twice.
- The server MAY add `"mcp.session": "<session id>"` to `host` of `run.started`.

## Discovery

| Resource | Content |
| :-- | :-- |
| `agent-events://runs` | JSON array of `{run, status, updated, subject}` for every run the client may read, newest first |

The server sends `notifications/resources/list_changed` when a run is added or removed, and `notifications/resources/updated` for `agent-events://runs` when the status of a listed run changes. A server that supports neither MUST say so in its capabilities (`resources.subscribe`, `resources.listChanged`), and readers then poll.

## Replay and resume

| Resource template | Content |
| :-- | :-- |
| `agent-events://runs/{run}/events{?after}` | `{run, lastSeq, events: [...]}`: the events of the run with `seq` greater than `after` (default 0), in `seq` order |
| `agent-events://runs/{run}/state` | the run state (`run-state.schema.json`) as folded by the server |

- A reader that joins late reads `…/events` once (full replay) or reads `…/state` and then follows from its `lastSeq`.
- A server MAY return fewer events than exist and set `"more": true`; the reader reads again with `after` set to the last `seq` it received.
- Profile state is included in `…/state` only for profiles the server knows.

## Follow

- A reader subscribes to `agent-events://runs/{run}/events` with `resources/subscribe`.
- On a new event the server sends `notifications/resources/updated` for that URI. The notification carries no event; the reader reads `…/events?after=<its last seq>`.
- A reader without subscription support polls the same URI.

## Delivery

- Events of one run are returned in `seq` order. Between runs there is no order.
- A reader may receive an event twice (a read overlaps a previous one); it deduplicates by `(run, seq)`.
- The server never drops an accepted event while the run is retained.

## Liveness

- Stale time: the core default of one hour.
- Additional signal: the run is `abandoned` when the MCP session that called `agent_events_start` has ended and no `run.finished` arrived, unless another session has emitted to the run since.
- The server never writes `run.finished` on behalf of a producer. A run that is emitted to again after being abandoned is `running` again.
- Producers SHOULD call `agent_events_emit` with `run.heartbeat` at least every 15 minutes during a long step.

## Retention

- The server MAY delete runs that are `finished` or `abandoned` and older than 7 days, and keeps at most a server-defined number of runs. A running run is never deleted.
- A server MAY persist runs through another binding, for example as `jsonl-file` run files; it is then the single writer of those files.

## Limits

- An event (body plus envelope) MUST NOT exceed 16384 bytes serialized, as in the core.
- A server MAY rate-limit `agent_events_emit` per run and reports exceeding calls as tool errors.

## Access

- Access follows the MCP transport: stdio servers trust their client; HTTP servers use the authorization of the MCP specification.
- A server decides which runs a client may read (for example only runs of the same user or workspace) and which runs it may emit to (for example only runs started in the same session or by the same user).
- The security rules of the core apply: no secrets, prompts or model output in events, readers treat all text as untrusted.

## Not used

- **MCP progress notifications** (`notifications/progress`): they belong to one request and its `progressToken`, end with it and cannot be replayed by another client. A server MAY additionally send them to the producer during a long tool call, but they are not agent-events.
- **Elicitation**: `needsYou` is a signal to displays; how a human answers is out of scope.

## Open points

- Whether readers need a push variant that carries the events in the notification (lower latency, but outside standard MCP resource semantics).
- Whether `agent_events_emit` should accept a batch of events.
- Binding fixtures (`fixtures/bindings/mcp/`): recorded tool calls and resource reads for start, emit, retry with `idempotencyKey`, resume with `after`, abandoned session.
