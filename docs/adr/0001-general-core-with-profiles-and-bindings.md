# ADR 0001: A general core with profiles and bindings

- Status: Proposed
- Date: 2026-11-08
- Related: GravionLabs/skills ADR 0001 and ADR 0002, GravionLabs/skills#450

## Context

agent-events started as an extraction of the progress events of the `deliver` skill (GravionLabs/skills). The extracted format is a deliver format, not a general one:

- `issue`, `prUrl`, `milestone` and `repository` assume GitHub.
- `release.updated` (`rcUrl`, `rcVersion`, `testIssue`, `reviewRound`), the `attention.kind` values (`pr_opened`, `ci_red`, `release_test`, …) and the `run.finished` results (`max reached`, `no progress`) are the deliver workflow.
- `host.poimenTerminal` and `host.herdrPane` name two displays in the schema.
- The tone table (step `review` with "fix" → warning, …) and the run state (delivered, blocked, paused, RC test) are deliver rules.
- The location `<git-common-dir>/.agents/events/` assumes a git repository.

agent-events is meant to be developed on its own, apart from skills and poimen: any agent, harness or workflow writes it, any display reads it, without knowing deliver. Only the envelope is general today: `v`, `seq`, `ts`, `run`, `type`, `tone`, `needsYou`, JSON Lines, additive change, unknown fields ignored.

Other protocols cover other layers (AG-UI: agent to UI inside a host app; ACP: editor to harness; A2A: agent to agent; MCP progress notifications; OpenTelemetry GenAI: telemetry). None describes the progress of a run as a durable, replayable record that displays outside the agent read.

## Decision

agent-events consists of a **core**, **profiles** and **bindings**.

### Core: events

Every event carries `v`, `seq` (per run, from 1, gapless), `ts` (RFC 3339), `run`, `type` and `tone`; `needsYou` is optional.

| Type | Carries |
| :-- | :-- |
| `run.started` | `profiles` (`["<name>@<major>"]`), `host`, optional `agent` (harness, model), optional `subject` (what the run as a whole works on) |
| `run.finished` | `outcome` (`succeeded`, `failed`, `cancelled`), optional `reason` |
| `task.started` | `task` (id, unique in the run), optional `parent` (task id), `subject` |
| `task.finished` | `task`, `outcome` (`succeeded`, `failed`, `cancelled`, `skipped`), optional `reason` |
| `step.started` | `task`, `step` (`name`, optional `n`, `total`, `text`) |
| `step.finished` | `task`, `step`, optional `links` |
| `progress` | optional `task`, `done`, `total`, optional `label` |
| `attention` | `id`, optional `task`, `reason`, `needsYou`, optional `links` |
| `attention.resolved` | `id` |

- **Subject and links.** `subject` is `{kind, id, title, url}` (`kind` free, for example `github.issue`). `links` is a list of `{rel, url, title}` (`rel` free, for example `pull-request`, `log`). A generic display shows title and links without knowing the domain.
- **Run subject.** `run.started` may carry a `subject` for the run as a whole (a milestone, a release, a ticket), with the tasks as its work items. `progress` without `task` is the progress of the run subject.
- **Known subject kinds.** `docs/subject-kinds.md` lists conventional `kind` values with a prefix per system (`github.issue`, `github.pull-request`, `github.milestone`, …). They are a convention, not a requirement; readers show an unknown kind generically. A display may offer a dedicated view for a kind it knows (poimen: a milestone panel for runs whose subject is `github.milestone`) and fetch more from the system itself through `subject.url`; that is a feature of the display, not of the format.
- **Tasks** may run in parallel and are flat; `parent` only groups them. The run state lists open tasks instead of one current task.
- **Attention** is resolved by `attention.resolved` with its `id`, and implicitly by `task.finished` of its task and by `run.finished`.
- **Host** is an open map with namespaced keys (`"herdr.pane": "w1:p2"`, `"poimen.terminal": "t3"`). The core names no display; each display reads its own key.
- **Tone** (`neutral`, `info`, `success`, `warning`, `danger`) and `needsYou` are core fields set by the writer. Displays map tone to their palette and never derive it. When which tone applies is a profile rule, not a core rule.
- **Steps**: `step.started` and `step.finished` are both optional for the writer.

### Core: run state

The core defines the fold of a run, with a schema and reader fixtures: status (`running`, `finished`, `abandoned`), outcome, open tasks with their last step, finished tasks per outcome, progress, open attentions, `needsYou`. Profiles extend it. Every reader, in any language, checks its fold against the same fixtures.

### Displays are core readers

A display MUST be able to show a run from the core alone; a profile is never required to display one. Profiles serve the writer's own tools and optional details. Displays depend on agent-events only, never on the repository of a profile.

| Shown | From the core |
| :-- | :-- |
| what the run works on | `subject` of `run.started` |
| what is worked on now | `subject.id`, `subject.title` of the open tasks |
| current step | `step.name`, `step.text` |
| pull request, log, release candidate | `links[]` (`rel`) |
| progress | `progress.done` / `progress.total` |
| colour, "needs you" | `tone`, `needsYou`, open `attention` |
| result per task and run | `outcome`, `reason` |

### Profiles

A profile adds types, fields, tone rules and state for one domain. Its types and fields carry its name as a prefix: types `<profile>.<name>` (`deliver.release.updated`), fields under an object of the same name (`"deliver": {…}`). Readers ignore profiles they do not know. A run declares its profiles in `run.started` (`profiles: ["deliver@1"]`).

Profiles live with their owner. agent-events holds only the core, the bindings, a guide "writing a profile" and a small example profile. The deliver profile (types, `attention` reasons, tone rules, state extension, fixtures) belongs to GravionLabs/skills.

### Bindings

The core is the format. Transport and location are bindings:

- `jsonl-file`, the first binding: one file per run `<run>.jsonl`, append-only, one writer process tree, whole lines, readers skip an incomplete last line, replay then follow. Lifecycle (`abandoned`: no `run.finished`, the writer's `pid` gone or the file unchanged for one hour) and retention (writers may delete finished and abandoned runs older than 7 days, keep at most 100; readers never delete). Location convention `<git-common-dir>/.agents/events/`, overridden by `AGENT_EVENTS_DIR`.
- Further bindings (stdout, HTTP/SSE) can be added without changing the format.

### Compatibility and versions

- Fields and types are only added within a major. Readers ignore unknown fields, types and profiles. A change in meaning bumps `v`.
- Every new type or fold rule comes with a fixture.
- 0.x until the core has been used: the first tag is `v0.1.0`, after this ADR and the rebuilt schemas. 0.x may break. `v1.0.0` follows once skills, poimen and herdr-plugins run against core plus deliver profile.

### Tooling

- Schemas are published on GitHub Pages under a stable URL per major (`…/schema/v0/core.schema.json`), used as `$id`.
- An npm package with a CLI `agent-events validate <file|->` checks a run file against the core and the profile schemas given by path or URL, including the JSONL rules (gapless `seq`, last line). A GitHub Action wraps it.
- No language SDKs until at least two consumers outside GravionLabs ask for one.

## Consequences

- Easier:
  - A display that knows only the core shows any run: status, open tasks, step, progress, tone, "needs you", links.
  - A new workflow writes core events plus its own profile, without a change in agent-events.
  - skills, poimen and herdr-plugins change their own parts in their own repositories; poimen and herdr-plugins depend on agent-events only.
  - Readers in pwsh, Rust and TypeScript check their fold against the same core fixtures.
- Harder:
  - The current content (deliver schema, deliver run state, deliver fixtures) is replaced by the core; the deliver part moves back to skills as the deliver profile.
  - deliver maps its vocabulary onto the core: `issue` → `task` plus `subject`, `prUrl` → `links`, `issue.finished` outcomes → `outcome` plus `deliver.outcome`, `milestone.progress` → `progress`.
  - Two schemas per run (core plus profile) and two fixture sets (core in agent-events, profile in skills).
  - GravionLabs/skills#452 pins `v0.1.0` and writes core plus deliver profile; GravionLabs/herdr-plugins#222 and GravionLabs/poimen#544 pin `v0.1.0` and read the core only.
  - The poimen Deliver panel becomes a panel for any run, plus a milestone panel for runs whose subject is `github.milestone`, from any writer; the herdr tokens are derived from the core, so the token fixtures belong to herdr-plugins.
  - Deliver details that the core does not carry (release review round) are not shown by generic displays unless they are expressed as links, attention or progress.
- Follow-ups: core schema and state schema with fixtures, `jsonl-file` binding spec, profile guide with example profile, validator CLI and Action, Pages publishing, then `v0.1.0`.

## Alternatives

- **Keep the deliver format as v1.** No work, but every other workflow would bend GitHub fields to its domain, and displays would keep deliver rules.
- **AG-UI types 1:1.** Known vocabulary, but built for a chat UI inside a host app, with text and tool events that are out of scope here.
- **Free fields per profile, nothing in the core about the subject.** Smaller core, but a generic display knows neither title nor link.
- **Reverse-DNS names** (`com.gravionlabs.deliver.…`). Globally unique like CloudEvents, but long in JSONL and fixtures. Short prefixes with a declaration in `run.started` are enough.
- **Tone only in profiles.** A purer core, but a generic display could not colour a run.
- **No state in the core.** Less spec, but the drift between three folds that skills ADR 0002 counters with fixtures.
- **One active task per run.** A simpler fold, but parallel subagents and grouping cannot be shown.
- **Profiles as a registry in agent-events.** One place for everything, but domain changes would again run through the spec repository.
- **Displays read profiles too.** Richer displays, but poimen and herdr-plugins would depend on skills again for the deliver profile.
- **Transport and location in the core.** Simpler to read, but cloud and stream cases do not fit.
- **1.0.0 right after the rebuild.** A clear promise, but every correction from first use would be a major.
