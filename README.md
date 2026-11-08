# agent-events

agent-events is the event format in which an agent run leaves its progress: one JSON Lines file per run, one event per line.

- A **writer** (an emitter such as `Report-Progress.ps1` of [GravionLabs/skills](https://github.com/GravionLabs/skills)) appends events.
- A **reader** (poimen, a herdr plugin, an agent) replays the file and follows it. The state of a run is the fold of its events.
- agent-events is this specification, the JSON Schemas and the fixtures that every reader checks its own fold against. It contains no runtime code.

Status: v1. Read the [specification](SPEC.md).

## Contents

| Path | What |
| :-- | :-- |
| [SPEC.md](SPEC.md) | events, tone, projection, location, lifecycle, compatibility |
| `schema/progress-event.schema.json` | one line of a run file |
| `schema/deliver-run-state.schema.json` | the fold of a run (output of a reducer) |
| `fixtures/<case>.jsonl` and `<case>.state.json` | events and the state a correct reducer produces |
| [CHANGELOG.md](CHANGELOG.md) | versions |

## Using it

Pin a version tag. Read the schema from `https://raw.githubusercontent.com/GravionLabs/agent-events/<tag>/schema/progress-event.schema.json` or copy the fixtures into your tests, and compare your reducer's output with each `*.state.json`.

```sh
npm install && npm test   # validates the fixtures against the schemas
```

## License

[MIT](LICENSE)
