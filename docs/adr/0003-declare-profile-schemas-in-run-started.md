# ADR 0003: Declare profile schemas in run.started

- Status: Proposed
- Date: 2026-11-09
- Issues: #40
- Amends: [ADR 0001](0001-general-core-with-profiles-and-bindings.md)

## Context

`run.started` declares `profiles: ["deliver@1"]` but not where the profile schema lives, so the validator only checks profiles passed with `--profile`. ADR 0001 keeps profiles with their owner and leaves readers independent of them.

## Decision

`run.started` gets an optional `profileSchemas` map from a `profiles` entry (`name@major`) to the `https://` URL of that profile's JSON Schema. A key not in `profiles` is a validator note, not a schema error. Readers never need it. `agent-events validate --declared-profiles` fetches the URLs and applies them like `--profile`; without the flag there is no network access. A `--profile` schema with the same `$id` replaces the fetch. This amends ADR 0001 (profiles are still owned elsewhere) and adds no URL convention.

## Consequences

A validator can find the schema of a declared profile from the file alone, and offline use stays possible. A writer states the URL in every run. Fetching trusts the host of the URL; there is no integrity check.

## Alternatives

- A URL convention derived from the profile name: no new field, but it fixes a hosting scheme for every owner.
- A profile registry in agent-events: one place, but it moves domain changes back into this repository (rejected in ADR 0001).
- Relative paths or `file:` URLs: not portable between hosts and a file-read risk; out of scope.
