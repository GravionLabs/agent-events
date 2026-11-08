# agent-events

agent-events is the event format in which an agent run leaves its progress: one JSON Lines file per run, one event per line.

- A **writer** (an emitter such as `Report-Progress.ps1` of [GravionLabs/skills](https://github.com/GravionLabs/skills)) appends events.
- A **reader** (poimen, a herdr plugin, an agent) replays the file and follows it. The state of a run is the fold of its events.
- agent-events is this specification, the JSON Schemas and the fixtures that every reader checks its own fold against. It contains no runtime code.

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

## Using it

Pin a version tag. Read the schema from `https://raw.githubusercontent.com/GravionLabs/agent-events/<tag>/schema/v0/core.schema.json` or copy the fixtures into your tests, and check your writer against `fixtures/events`.

```sh
npm install && npm test   # validates all fixtures against the core schema
```

## Development

Toolchain: Node.js 26 or newer (runs TypeScript directly, no build step), TypeScript (type check only), Biome (lint and format) and `node:test` with `node:assert`.

```sh
npm test            # node --test test/validate.ts
npm run typecheck   # tsc --noEmit
npm run lint        # biome lint
npm run format:check # biome format
```

## License

[MIT](LICENSE)
