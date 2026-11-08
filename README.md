# agent-events

agent-events is the event format in which an agent run leaves its progress: one JSON Lines file per run, one event per line.

- A **writer** (an emitter such as `Report-Progress.ps1` of [GravionLabs/skills](https://github.com/GravionLabs/skills)) appends events.
- A **reader** (poimen, a herdr plugin, an agent) replays the file and follows it. The state of a run is the fold of its events.
- agent-events is this specification, the JSON Schemas and the fixtures that every reader checks its own fold against. Besides that it ships a validator, the `agent-events` CLI and a GitHub Action.

Status: 0.x, the core is being rebuilt (see [ADR 0001](docs/adr/0001-general-core-with-profiles-and-bindings.md)). Read the [specification](SPEC.md).

## Contents

| Path                                               | What                                                                                                 |
| :------------------------------------------------- | :--------------------------------------------------------------------------------------------------- |
| [SPEC.md](SPEC.md)                                 | the core: events, subject and links, tasks, attention, host, tone, profiles, compatibility, security |
| [bindings/jsonl-file.md](bindings/jsonl-file.md)   | the jsonl-file binding: file, lifecycle, retention, location |
| `schema/v0/core.schema.json`                       | one line of a run file                                                                               |
| `fixtures/events/valid/*.jsonl`, `invalid/*.jsonl` | writer fixtures: accepted and rejected run files                                                     |
| [docs/subject-kinds.md](docs/subject-kinds.md)     | conventional `subject.kind` values                                                                   |
| [docs/profiles.md](docs/profiles.md)               | how to write a profile, with an example in `examples/profiles/example/` |
| [CHANGELOG.md](CHANGELOG.md)                       | versions                                                                                             |

## Validate a run file

```sh
npx agent-events validate .git/.agents/events/r1.jsonl              # one file
npx agent-events validate '.git/.agents/events/*.jsonl'            # a glob (quote it)
cat r1.jsonl | npx agent-events validate -                         # stdin
npx agent-events validate r1.jsonl --profile examples/profiles/example/example.schema.json
npx agent-events validate r1.jsonl --profile https://example.org/profiles/deliver/v1/deliver.schema.json
```

`--profile <path|url>` is repeatable; each profile schema is applied to every line in addition to the core schema. Findings print one per line as `<file>:<line>: <error|note>: <message>`; the exit code is 0 when there is no error (notes are fine) and 1 otherwise. Checks: the core schema (and profiles) per line, `seq` gapless from 1, one `run` per file, `run.started` first and only once, lines up to 16384 bytes. An incomplete last line (no newline yet) is reported as a note, not an error.

```text
r1.jsonl:3: error: seq 5, expected 3
r1.jsonl:9: note: incomplete last line skipped
```

### GitHub Action

```yaml
- uses: GravionLabs/agent-events@v0
  with:
    files: 'runs/*.jsonl'
    profiles: |
      examples/profiles/example/example.schema.json
```

Inputs: `files` (file or glob), `profiles` (one path or URL per line), `version` (npm version of `agent-events`, default `latest`).

## Install

```sh
npm install github:GravionLabs/agent-events#v0.1.0   # builds dist/ through the prepare script (newer npm warns until you approve it: npm install-scripts approve agent-events)
npm install https://github.com/GravionLabs/agent-events/releases/download/v0.1.0/agent-events-0.1.0.tgz
npx agent-events validate runs/*.jsonl
```

## Using it

Pin a version tag. Read the schema from `https://raw.githubusercontent.com/GravionLabs/agent-events/<tag>/schema/v0/core.schema.json` or copy the fixtures into your tests, and check your writer against `fixtures/events`.

```sh
npm install && npm test   # validates all fixtures against the core schema
```

## Development

Toolchain: Node.js 26 or newer (runs TypeScript directly in tests), TypeScript (type check, and `npm run build` compiles `src/` to `dist/` for the npm package, because Node does not strip types under `node_modules`), Biome (lint and format) and `node:test` with `node:assert`.

```sh
npm run build       # tsc: src/ to dist/
npm test            # builds, then node --test
npm run typecheck   # tsc --noEmit
npm run lint        # biome lint
npm run format:check # biome format
```

## Release

`CHANGELOG.md` is generated from the conventional commits by git-cliff (`npm run changelog:release` writes the section of the `package.json` version). Prepare the release PR from `release/next` with the version bumped in `package.json` and the regenerated changelog. Merge the release PR with a merge commit; the tag follows from the merge: the `release.yml` workflow runs on the push to `main`, checks that the `package.json` version has a `CHANGELOG.md` section (`node src/release-notes.ts --check`, also in `npm test`), creates the tag `v<version>` when it does not exist and the GitHub release with `schema/v0/*.json` and the `npm pack` tarball as assets. The release body is the changelog section of the tag. npm publish is not part of it.

## License

[MIT](LICENSE)
