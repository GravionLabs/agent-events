# ADR 0005: Run commands as the inbound counterpart of events

- Status: Proposed
- Date: 2026-11-13
- Supersedes: [ADR 0004](0004-binding-contract-and-envelope-stamping.md) in part (non-goal "No back channel", for runs only)
- Builds on: [ADR 0001](0001-general-core-with-profiles-and-bindings.md), [ADR 0004](0004-binding-contract-and-envelope-stamping.md)

## Context

agent-events describes what a run reports. Nothing describes how a person, a display or another agent acts on a run. ADR 0004 records this as a non-goal ("No back channel: `needsYou` signals; the answer happens elsewhere").

In practice, every workflow builds its own back channel. deliver (GravionLabs/skills) has four:

- a stop file per run (`deliver-loop stop`)
- runner subcommands for an objective (`deliver-loop release`, `deliver-loop takeover`)
- GitHub comments plus removing the `needs-decision` label to answer a question
- Ctrl+C

A controller (a display such as poimen, an MCP server, a chat client) has to know which of these applies when. One example: `stop` refuses on an objective runner and points to `release`. No controller can act on a run it only knows from the core.

There are two levels of control:

| Level | Target | Examples |
| :-- | :-- | :-- |
| **Run** | a run of agent-events: a loop, a pipeline, a batch of tasks | stop after the current task, answer an `attention`, profile actions (release, takeover) |
| **Session** | one live agent session inside a task | push a message mid-turn, interrupt, approve a tool call |

The session level is covered elsewhere, and the field is not settled (state 2026-11):

- **ACP** (Agent Client Protocol, Zed, JetBrains) drives a harness over stdio. Copilot CLI speaks it natively with `--acp`, as a public preview since 2026-01. Claude Code speaks it only through a community adapter (`claude-agent-acp`). ACP v1 has no mid-turn steering, only `session/cancel`.
- **Claude Code** has its own mechanisms instead:
  - cross-session messaging: an inbox socket per session, including `claude -p`; messages arrive between tool calls of an active turn
  - channels: MCP servers that push into a session, still a research preview
  - the Agent SDK streaming input, with queued messages and interrupts
- **A2A** (Agent2Agent 1.0, Linux Foundation) is agent to agent over HTTP. It is not used by local coding harnesses.

None of them covers the run level. A2A's task model is the closest fit: a task with an `input-required` state, a message that answers it, and cancel. But A2A needs an HTTP server per agent, which a script-driven loop does not have.

## Decision

agent-events gets **commands**: the run-level, inbound counterpart of events. The session level stays out of scope (see Non-goals).

### Roles

- A **controller** issues a command for a run: a display, an MCP server, a CLI, another agent.
- The **writer** of the run (ADR 0004) is the only component that consumes the run's commands. It decides, applies, and reports the outcome as events of the same run. One writer per run stays the rule, and commands never write events.

### Command envelope

A command is one JSON object:

| Field | Meaning |
| :-- | :-- |
| `v` | format version, as for events |
| `id` | unique per command (a UUID or a ULID); the writer handles each `id` at most once |
| `ts` | RFC 3339 time at the controller, informational |
| `run` | the target run |
| `type` | command type |
| `issuer` | `{kind, id, title}` of the controller, for example `{"kind": "human", "id": "cli"}` or `{"kind": "agent", "id": "poimen"}`; informational, not an authentication |
| type fields | depending on `type` |

Profile commands follow the profile rules of ADR 0001: type `<profile>.<name>`, fields under an object of the profile's name.

### Core command types

| Type | Fields | Effect |
| :-- | :-- | :-- |
| `run.stop` | `when`: `after-task` (default) or `now` | `after-task`: no new task starts, and the run ends `cancelled` after the open tasks finish. `now`: open tasks are cancelled as far as the writer can; best effort. |
| `attention.answer` | `attention` (the `id` of an open `attention`), `text`, optional `choice` | answers an open attention. The writer emits `attention.resolved` once the answer is applied. |

The vocabulary follows A2A where it overlaps: an open `attention` with `needsYou` is A2A's `input-required`, `attention.answer` is the message that answers it, and `run.stop` is cancel. A later A2A binding can therefore map commands without renaming them.

### Capabilities

`run.started` gets an optional `accepts`: a list of command types the writer handles, for example `["run.stop", "attention.answer", "deliver.release"]`. A controller offers only those. A run without `accepts` takes no commands, and every existing writer stays valid.

### Acknowledgement as events

New core event types, all with `command` (the command `id`) and optional `reason`:

| Event | Meaning | Default tone |
| :-- | :-- | :-- |
| `command.accepted` | the writer will apply the command (`run.stop` with `after-task`: from the next task boundary) | `neutral` |
| `command.rejected` | not applied: unknown type, not in `accepts`, attention not open, run finished, duplicate `id` | `warning` |
| `command.applied` | the effect has taken place | `neutral` |

A command is in effect only when `command.accepted` appears; writing a command guarantees nothing. The fold adds `commands`: accepted commands without `command.applied`. A controller follows the run's events to learn the outcome, exactly as a display does.

### Rules for writers

- **Check points.** A writer reads its commands at least at every task boundary and before it starts a new task. The binding states the latency it promises. Applying a command inside a task is allowed, not required.
- **Commands are data.** `attention.answer.text` comes from outside the run. A writer that passes it to a model passes it as fenced data, never as instructions, and a command never widens permissions.
- **Idempotency.** A writer handles a command `id` once. A repeated `id` gets `command.rejected` with reason `duplicate`, or no event.

### Binding: `jsonl-file`

- Commands of run `<run>` live next to the run file in the directory `<run>.commands/`, one file per command `<id>.json`.
- A controller writes the file atomically: a temporary name in the same directory, then rename. This works with several controllers and on Windows without locks.
- The writer polls the directory at its check points. It never deletes command files itself. Retention deletes the directory together with the run file.
- Access is the file system: whoever may write the events directory may command its runs.
- The binding contract of ADR 0004 gets a section **Commands**: how a controller submits a command, how the writer receives it, the latency promised, and access. A binding without commands says so.

### Non-goals

- **The session level.** Steering a live agent session (mid-turn messages, interrupts, tool approvals) belongs to the harness: ACP, Claude Code cross-session messaging or channels, the Agent SDK. A writer MAY forward a command into a session through such a mechanism, for example `run.stop` with `now` as an interrupt. That is the writer's adapter, not part of the format.
- **Starting runs.** A command targets an existing run. Starting one is the job of the tool that writes it.
- **Authentication.** `issuer` is informational. Access is a binding concern (file permissions, the MCP session).

## Consequences

- Easier:
  - A controller acts on any run from the core alone: stop it, answer its open attentions, and see the outcome as events.
  - poimen, an MCP server (GravionLabs/skills#395) and a CLI are interchangeable controllers. None of them needs to know the workflow.
  - deliver's ad-hoc channels collapse into commands:
    - the stop file becomes `run.stop`
    - `deliver-loop release` and `takeover` become profile commands `deliver.release` and `deliver.takeover`
    - the `needs-decision` comment becomes `attention.answer` (deliver still writes the answer to GitHub)
  - Switching the session-level technology (ACP, Claude, a successor) never touches the format.
- Harder:
  - Writers must poll for commands and report them. A writer that ignores them leaves out `accepts` and loses nothing.
  - Three new event types and one fold field, each with fixtures; schema `command.schema.json`; the validator learns command files.
  - The `mcp` binding (draft) has to define a command tool, and with it who may call it.
  - deliver keeps its old channels until the deliver profile ships commands. Both work in parallel for at least one minor release.
- Follow-ups:
  - SPEC.md: commands section, the narrowed non-goal, schemas, fixtures
  - `bindings/jsonl-file.md` and `bindings/mcp.md`: the Commands section
  - skills: deliver profile with `accepts`, `deliver.release`, `deliver.takeover`, the loop reading the inbox, and `deliver-loop stop` writing `run.stop`
  - poimen: controls for `accepts`

## Alternatives

- **No back channel (ADR 0004 as is).** Nothing to specify, but every workflow keeps its own channels and no controller is generic.
- **A2A as the run protocol.** An industry standard with a matching task model, but every run would need an HTTP server. A loop of scripts has none, and a background server per machine is not wanted. The vocabulary is reused instead.
- **ACP.** It covers the session level only, and has no notion of a run spanning several sessions.
- **Commands in the event file.** One file per run, but it breaks "one writer per run": controllers would append events.
- **One append-only `<run>.commands.jsonl`.** Like the run file, but several controllers would append concurrently, and atomic appends are not portable (Windows).
- **GitHub as the channel** (comments, labels). Durable and visible, but tied to one forge, slow, and limited by the API rate limit; it stays deliver's own record, not the transport.
- **MCP as the only transport.** It fits AI clients, but a CLI or a display without MCP could not command a run. MCP becomes one binding.
- **Process signals.** Immediate, but not portable, carry no data (no answer to an attention), and the controller has to know the process.
- **Include the session level now.** One protocol for everything, but it would bet on one of ACP, Claude's mechanisms or channels while the field is still moving.
