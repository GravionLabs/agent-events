# agent-events

agent-events is an event format for agent runs: the events in which a run leaves its progress. The format is independent of harness, skill and transport. Bindings carry it over a transport: a file, or a stream such as MCP. The first binding is JSON Lines, one JSON Lines file per run with one event per line ([bindings/jsonl-file.md](bindings/jsonl-file.md)).

Writers and readers are examples of what uses the format, not parts of it:

- A **writer** appends events, for example `Report-Progress.ps1` of [GravionLabs/skills](https://github.com/GravionLabs/skills).
- A **reader** replays the events and follows them, for example poimen, herdr or an agent. The state of a run is the fold of its events.
- agent-events is this specification, the JSON Schemas and the fixtures that every reader checks its own fold against. Besides that it ships a validator, the `agent-events` CLI and a GitHub Action.

Status: 0.x, the core is being rebuilt (see [ADR 0001](docs/adr/0001-general-core-with-profiles-and-bindings.md)). Read the [specification](SPEC.md).

## Contents

| Path                                               | What                                                                                                 |
| :------------------------------------------------- | :--------------------------------------------------------------------------------------------------- |
| [SPEC.md](SPEC.md)                                 | the core: events, subject and links, tasks, attention, host, tone, profiles, compatibility, security |
| [bindings/jsonl-file.md](bindings/jsonl-file.md)   | the jsonl-file binding: file, lifecycle, retention, location |
| [bindings/mcp.md](bindings/mcp.md)                 | the mcp binding (draft): agents write through tools, readers subscribe to resources |
| [docs/adr/](docs/adr/)                             | decisions: [0001](docs/adr/0001-general-core-with-profiles-and-bindings.md) core, profiles, bindings; [0002](docs/adr/0002-binding-contract-and-envelope-stamping.md) binding contract, envelope stamping (proposed) |
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

## Fold a run file into its state

```sh
npx agent-events state r1.jsonl                          # the run state as JSON
cat r1.jsonl | npx agent-events state -                  # stdin
npx agent-events state r1.jsonl --now 2026-11-08T12:00:00Z   # the clock for the abandoned status
```

`state` prints the reference fold of [SPEC.md](SPEC.md) "Run state". `--now <ts>` (RFC 3339) is the reader's clock: a running run whose last event is more than an hour older is `abandoned`; the default is the current time. Readers in any language compare their own fold with this output.

TypeScript readers import the same fold:

```ts
import { fold, type RunState } from 'agent-events'

const state: RunState = fold(text, new Date())
```

`fold(text, now)` takes the file text and the reader's clock; `ABANDONED_AFTER_MS` and the `Link` type are exported too.

### GitHub Action

```yaml
- uses: GravionLabs/agent-events@v0
  with:
    files: 'runs/*.jsonl'
    profiles: |
      examples/profiles/example/example.schema.json
```

Inputs: `files` (file or glob), `profiles` (one path or URL per line), `version` (npm version of `agent-events`; default: the CLI of the Action's own ref, built from its checkout, so `@v0` runs the code of `v0`; set it to an npm version once the package is published).

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

The package runs on Node.js 22 or newer (compiled `dist/`). Toolchain: Node.js 26 or newer (runs TypeScript directly in tests), TypeScript (type check, and `npm run build` compiles `src/` to `dist/` for the npm package, because Node does not strip types under `node_modules`), Biome (lint and format) and `node:test` with `node:assert`.

```sh
npm run build       # tsc: src/ to dist/
npm test            # builds, then node --test
npm run typecheck   # tsc --noEmit
npm run lint        # biome lint
npm run format:check # biome format
```

## Release

`CHANGELOG.md` is generated from the conventional commits by git-cliff (`npm run changelog` writes the section of the `package.json` version). Prepare the release PR from `release/next` with the version bumped in `package.json` and the regenerated changelog. Merge the release PR with a merge commit; the tag follows from the merge (if a release run fails after the tag was created, delete the tag before re-running): the `release.yml` workflow runs on the push to `main`, checks that the `package.json` version has a `CHANGELOG.md` section (`node src/release-notes.ts --check`, also in `npm test`), creates the tag `v<version>` when it does not exist and the GitHub release with `schema/v0/*.json` and the `npm pack` tarball as assets. The release body is the changelog section of the tag. npm publish is not part of it.

## License

[MIT](LICENSE)
