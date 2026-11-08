# Writing a profile

A profile adds types, fields, tone rules and state for one domain on top of the core ([SPEC.md](../SPEC.md), [ADR 0001](adr/0001-general-core-with-profiles-and-bindings.md)). A working example is in [examples/profiles/example/](../examples/profiles/example/).

## Naming

- Profile name: `[a-z][a-z0-9-]*`, for example `deliver`.
- Types: `<profile>.<type>`, for example `deliver.release.updated`. Never reuse a core type name.
- Fields: all profile fields sit under one object named like the profile: `"deliver": {"rcVersion": "1.2.0-rc.1"}`. A profile adds no top-level field.
- `host` keys keep their own rule: `<namespace>.<key>`.

## Declaration

A run lists its profiles in `run.started` as `name@major`: `"profiles": ["deliver@1"]`. The major changes only when a meaning changes; within a major, types and fields are only added. A run may declare several profiles. A reader ignores a profile it does not know, and the events stay valid against the core.

## Tone rules

The core only defines the values of `tone` and `needsYou`. The profile says when which applies to its own types, for example `warning` plus `needsYou: true` when a review requests changes. The writer sets them; a display never derives them again. Reasons of `attention` for the profile are prefixed too (`example.changes-requested`).

## State extension

The core run state is always folded from the core events and does not change. A profile may define extra state for its own types (for example the open review round), written as an object under the profile name next to the core state. It never changes a core field. A reader without the profile shows the core state only.

## Fixtures

Every type and every fold rule of a profile comes with a fixture: valid run files, invalid run files (one defect each) and, per run file, the expected core state (and the profile state, if it has one). The example has `review.jsonl` and `review.state.json`.

## Validation

A run file is valid when every line is valid against the core schema and, for a declared profile, against the profile schema. The profile schema checks only its own types and fields: it requires the fields of its types and leaves everything else open. Until the validator CLI exists, the test `test/profile.ts` shows how to apply both schemas with Ajv.

## Where profiles live

With their owner, not in this repository. agent-events holds the core, the bindings, this guide and the small example. The deliver profile (types, `attention` reasons, tone rules, state extension, fixtures) belongs to GravionLabs/skills. A new profile lives in the repository of the team that writes the events, and brings its schema and fixtures.

## A display never needs a profile

A display MUST show any run from the core alone: status, tasks, step, progress, tone, "needs you" and links. A profile can add detail for displays that choose to know it, but nothing may be visible only through a profile. If a fact matters to every display, express it in core terms (`links`, `attention`, `progress`, `tone`).
