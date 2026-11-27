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

The core only defines the values of `tone` and `needsYou`. The profile says when which applies to its own types, for example `warning` plus `needsYou: true` when a review requests changes. The writer sets them; a display never derives them again. Reasons of `attention` for the profile are prefixed too (`example.changes-requested`). `reason` is always a code (`^[a-z][a-z0-9.-]*$`), never a sentence; the human sentence goes into the optional `text`. A display shows `text` and falls back to `reason`.

## State extension

The core run state is always folded from the core events and does not change. A profile may define extra state for its own types (for example the open review round), written as an object under the profile name next to the core state. It never changes a core field. A reader without the profile shows the core state only.

## Fixtures

Every type and every fold rule of a profile comes with a fixture: valid run files, invalid run files (one defect each) and, per run file, the expected core state (and the profile state, if it has one). The example has `review.jsonl` and `review.state.json`.

## Validation

A run file is valid when every line is valid against the core schema and, for a declared profile, against the profile schema. The profile schema checks only its own types and fields: it requires the fields of its types and leaves everything else open. The validator CLI applies both schemas. From `examples/profiles/example/`:

```sh
npx agent-events validate review.jsonl --profile example.schema.json
```

`--profile` takes a path or a URL and may be repeated.

A run can say where its profile schemas live: `run.started` takes an optional `profileSchemas` map from a `profiles` entry to the `https://` URL of its schema (`"profileSchemas": {"deliver@1": "https://…/deliver.schema.json"}`). The validator ignores it unless asked: `--declared-profiles` fetches every URL of the file's map and applies it like `--profile`; without the flag there is no network access. A fetch that fails prints `profile: <url>: …` and exits 1. A `--profile` schema whose `$id` equals a declared URL replaces that fetch, so `npx agent-events validate review.jsonl --declared-profiles --profile example.schema.json` works offline. A key that is not in `profiles` is a note. Readers and displays never need the schema. The test `test/profile.ts` shows the same with Ajv.

## Where profiles live

With their owner, not in this repository. agent-events holds the core, the bindings, this guide and the small example. The deliver profile (types, `attention` reasons, tone rules, state extension, fixtures) belongs to GravionLabs/skills. A new profile lives in the repository of the team that writes the events, and brings its schema and fixtures.

## Events in use: `deliver` and `ci`

These examples show events that writers of [GravionLabs/skills](https://github.com/GravionLabs/skills) add to a run. They are not part of the core, their owner defines them and its documentation wins over this summary. A reader that does not know them ignores them and counts their `seq`.

Not all of them follow the [naming rule](#naming): only `ci.run.completed` is a `<profile>.<type>` name. `merged`, `handover`, `aside`, `milestone-done`, `publish-ok` and `publish-failed` have no prefix, and the `deliver` fields sit at the top level of the event, under no profile (`"profiles": []`). Take them as examples of events, not of naming: a new profile prefixes its types and puts its fields under its name.

### `deliver`: what a delivery loop reports

An orchestrator reacts to these instead of polling. `repo` is `owner/repo`, `issue` a number, `pr` the URL of the pull request (left out without one), `reason` a code and `text` the sentence for people.

| Type | Fields | When |
| :-- | :-- | :-- |
| `merged` | `repo`, `issue`, `pr`, `risk` (`low`, `medium`, `high`; left out when unknown) | once per merged issue |
| `handover` | `repo`, `issue`, `pr`, `reason`, `text` | a pull request is handed to a person |
| `aside` | `repo`, `issue`, `pr`, `reason`, `text`, `hold` (`needs-decision`, only when it waits for a decision) | an issue is set aside |
| `milestone-done` | `repo`, `milestone`, `merged`, `aside` (counts of this run), `pr` (the release pull request) | at the end of a milestone run that was neither stopped nor ended by an error; the milestone is complete only with `pr` |

```jsonl
{"v":1,"seq":1,"ts":"2026-11-27T09:00:00Z","run":"0193700a-1c00-7a10-8f00-0000000000d1","type":"run.started","tone":"neutral","profiles":[],"host":{},"origin":{"repo":"example/api","branch":"main","worktree":"/home/dev/api","host":"build-box"},"subject":{"kind":"milestone","id":"M3","title":"M3"}}
{"v":1,"seq":2,"ts":"2026-11-27T09:20:00Z","run":"0193700a-1c00-7a10-8f00-0000000000d1","type":"merged","tone":"success","repo":"example/api","issue":12,"pr":"https://example.com/example/api/pull/14","risk":"low"}
{"v":1,"seq":3,"ts":"2026-11-27T09:30:00Z","run":"0193700a-1c00-7a10-8f00-0000000000d1","type":"handover","tone":"warning","repo":"example/api","issue":13,"pr":"https://example.com/example/api/pull/15","reason":"protected-paths","text":"changes protected paths: .github/"}
{"v":1,"seq":4,"ts":"2026-11-27T09:40:00Z","run":"0193700a-1c00-7a10-8f00-0000000000d1","type":"aside","tone":"warning","repo":"example/api","issue":16,"reason":"needs-decision","hold":"needs-decision","text":"needs-decision: which format?"}
{"v":1,"seq":5,"ts":"2026-11-27T09:50:00Z","run":"0193700a-1c00-7a10-8f00-0000000000d1","type":"milestone-done","tone":"warning","repo":"example/api","milestone":"M3","merged":1,"aside":1}
{"v":1,"seq":6,"ts":"2026-11-27T09:50:01Z","run":"0193700a-1c00-7a10-8f00-0000000000d1","type":"run.finished","tone":"warning","outcome":"failed","reason":"incomplete"}
```

### `ci`: events written on behalf of CI

A script that polls the CI of a repository after a release merge writes a run of its own into the same directory. It declares `ci@1`, and its subject is the merge commit. The script is the one writer of that run; CI and the delivery loop do not write into it.

| Type | Fields under `ci` | Tone |
| :-- | :-- | :-- |
| `ci.run.completed` | `name`, `conclusion`, `url`; one per completed workflow run | `success` or `danger` |
| `publish-ok` | `tag`, `release` (URL) | `success` |
| `publish-failed` | `job` (null when no job failed, for example a missing tag), `url`, `text` | `danger` |

The run ends with `run.finished`: `succeeded` after `publish-ok`, `failed` with reason `ci.publish-failed` after `publish-failed`. While the publish is still pending when the script gives up, it ends `cancelled` (`ci.pending`); when CI cannot be read, `failed` (`ci.unreadable`).

```jsonl
{"v":1,"seq":1,"ts":"2026-11-27T10:00:00Z","run":"0193700f-9e00-7c30-8f00-0000000000c1","type":"run.started","tone":"info","profiles":["ci@1"],"host":{},"origin":{"repo":"example/api","branch":"main","worktree":"/home/dev/api","host":"build-box"},"subject":{"kind":"commit","id":"4f2a9c1d8e7b6a5f4c3d2e1f0a9b8c7d6e5f4a3b","title":"example/api@4f2a9c1"}}
{"v":1,"seq":2,"ts":"2026-11-27T10:06:00Z","run":"0193700f-9e00-7c30-8f00-0000000000c1","type":"ci.run.completed","tone":"danger","ci":{"name":"release","conclusion":"failure","url":"https://example.com/example/api/actions/runs/102"}}
{"v":1,"seq":3,"ts":"2026-11-27T10:06:01Z","run":"0193700f-9e00-7c30-8f00-0000000000c1","type":"publish-failed","tone":"danger","ci":{"job":"publish","url":"https://example.com/example/api/actions/runs/102","text":"failed: release [publish]"}}
{"v":1,"seq":4,"ts":"2026-11-27T10:06:02Z","run":"0193700f-9e00-7c30-8f00-0000000000c1","type":"run.finished","tone":"danger","outcome":"failed","reason":"ci.publish-failed","text":"failed: release [publish]"}
```

## A display never needs a profile

A display MUST show any run from the core alone: status, tasks, step, progress, tone, "needs you" and links. A profile can add detail for displays that choose to know it, but nothing may be visible only through a profile. If a fact matters to every display, express it in core terms (`links`, `attention`, `progress`, `tone`).
