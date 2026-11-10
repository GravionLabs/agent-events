# ADR 0002: Separate reason code from human text

- Status: Proposed
- Date: 2026-11-09
- Issues: #37

## Context

`reason` is used two ways: free text in the core fixtures (`CI is red`) and a prefixed code in the profile guide (`example.changes-requested`). A reader cannot branch on free text, and a display cannot show a code to a person.

## Decision

`reason` is a machine-readable code matching `^[a-z][a-z0-9.-]*$`; profile reasons are prefixed `<profile>.`. A new optional `text` (string, at least one character) carries the human sentence, on `attention`, `task.finished` and `run.finished`. The fold copies `text` like `reason`; open tasks moved by `run.finished` get `reason` `run-finished` and `text` `run finished`. Displays SHOULD show `text` and fall back to `reason`.

This is breaking within `v: 1`, because the spec is 0.x and may break. There is no `v` bump. The core defines no list of codes.

## Consequences

Readers can branch on `reason` and displays can show `text`. Existing writers with a sentence in `reason` fail validation and must move it to `text` and pick a code.

## Alternatives

- Keep `reason` free text and add `code`: keeps old writers valid, but leaves the profile guide's prefixed `reason` inconsistent.
- Bump `v` to 2: not needed while the spec is 0.x.
