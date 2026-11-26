# Roadmap

Source: [ADR 0001](docs/adr/0001-general-core-with-profiles-and-bindings.md) and the open issues. State: 2026-11-08.

## M001 — v0.1.0: general core, jsonl-file binding, validator

Feature [#1](https://github.com/GravionLabs/agent-events/issues/1). All seven PBIs are open.

| Step | Issue | Depends on | Result |
|------|-------|------------|--------|
| 1 | [#2](https://github.com/GravionLabs/agent-events/issues/2) core event schema and core spec | – | `core.schema.json`, writer fixtures, `SPEC.md` as core spec; deliver schema and fixtures removed |
| 2a | [#3](https://github.com/GravionLabs/agent-events/issues/3) core run state with reader fixtures | #2 | `run-state.schema.json`, fold rules in `SPEC.md`, reader fixtures, reference fold |
| 2b | [#4](https://github.com/GravionLabs/agent-events/issues/4) jsonl-file binding | #2 | `bindings/jsonl-file.md`, linked from `SPEC.md` |
| 2c | [#5](https://github.com/GravionLabs/agent-events/issues/5) profile guide with example profile | #2 | `docs/profiles.md`, `examples/profiles/example/` |
| 3 | [#6](https://github.com/GravionLabs/agent-events/issues/6) `agent-events validate` and GitHub Action | #2, #4, #5 | npm CLI, `action.yml`, tests over writer fixtures and example profile |
| 4 | [#7](https://github.com/GravionLabs/agent-events/issues/7) Pages, CI and release | #2–#6 | schemas under `schema/v0/`, CI, `CHANGELOG.md`, tag `v0.1.0` |
| 5 | [#8](https://github.com/GravionLabs/agent-events/issues/8) RC test (interactive) | #7 | manual test before the tag, result as comment |

Notes:

- #2 comes first: every other PBI builds on the core schema. #3 and #2 both edit `SPEC.md`, so #3 follows #2 rather than running in parallel.
- #3, #4 and #5 are independent of each other and can run in parallel once #2 is merged.
- #6 needs the binding (#4, for the `seq`/last-line rules) and the example profile (#5, for its tests). #3 is not a hard blocker.
- #8 is `interactive`; it needs a human and does not run unattended.

Definition of done: `v0.1.0` tagged, every `$id` resolves, no deliver-specific type, field or rule left in the core.

## After v0.1.0 — towards v1.0.0

No issues yet. Candidates from the ADR, to be planned once v0.1.0 is out:

1. **Consumers adopt v0.1.0** — GravionLabs/skills#452 (deliver profile, writes core plus profile), GravionLabs/poimen#544 and GravionLabs/herdr-plugins#222 (read the core only). Findings from this use drive 0.x changes; 0.x may break.
2. **v1.0.0** — once skills, poimen and herdr-plugins run against core plus deliver profile. Freezes `schema/v1/` and the compatibility rules.

## Not planned

- Language SDKs — only after at least two consumers outside GravionLabs ask for one.
- Bindings other than `jsonl-file` (stdout, HTTP/SSE) — can be added without changing the format.
- Mapping document to AG-UI and OpenTelemetry.
- The deliver profile — lives in GravionLabs/skills.
