# Changelog

## Unreleased

- Initial extraction of the progress event schema, the run state schema and the fixtures from GravionLabs/skills (`skills/delivery/deliver/schema/`, `test/skills/delivery/fixtures/progress-events/`).
- Core event schema `schema/v0/core.schema.json`, core spec, writer fixtures and `docs/subject-kinds.md`; the deliver schemas and fixtures are removed (deliver profile belongs to GravionLabs/skills).
- Core run state schema `schema/v0/run-state.schema.json`, folding rules in `SPEC.md`, reader fixtures `fixtures/state/` and a reference fold in `test/fold.ts`.
- Profile guide `docs/profiles.md` and an example profile `examples/profiles/example/`.
