# Changelog

## Unreleased

- Fix: a git install now builds the CLI (`prepare` runs `npm run build`; it replaces `prepublishOnly`), `release.yml` attaches the `npm pack` tarball, and `test/install.ts` installs the packed tarball and runs `agent-events validate` on a fixture (#28).

## v0.1.0

Release notes:

- The schemas are served on GitHub Pages under `https://gravionlabs.github.io/agent-events/schema/v0/` (workflow `pages.yml`); a test checks that each `$id` equals its served path.
- CI (`ci.yml`) runs typecheck, lint, format check, schema, fixture and validator tests on every push and pull request.
- Pushing a `v*` tag runs `release.yml`, which creates the GitHub release with `schema/v0/*.json` and the `npm pack` tarball as assets.
- npm publish: decision to wait. Publishing needs an npm token that is not configured yet; `agent-events` 0.1.0 is not on npm, and the GitHub Action `version: latest` input needs it. Until then install with `npm install github:GravionLabs/agent-events#v0.1.0` (the `prepare` script builds `dist/` on a git install) or from the `agent-events-<version>.tgz` attached to the GitHub release.

- Initial extraction of the progress event schema, the run state schema and the fixtures from GravionLabs/skills (`skills/delivery/deliver/schema/`, `test/skills/delivery/fixtures/progress-events/`).
- Core event schema `schema/v0/core.schema.json`, core spec, writer fixtures and `docs/subject-kinds.md`; the deliver schemas and fixtures are removed (deliver profile belongs to GravionLabs/skills).
- Core run state schema `schema/v0/run-state.schema.json`, folding rules in `SPEC.md`, reader fixtures `fixtures/state/` and a reference fold in `test/fold.ts`.
- Profile guide `docs/profiles.md` and an example profile `examples/profiles/example/`.
- npm package `agent-events` with the CLI `agent-events validate <file|glob|-> [--profile <path|url>]...` (schema per line, gapless `seq`, one `run`, `run.started` first, incomplete last line as note) and the GitHub Action `action.yml`.
