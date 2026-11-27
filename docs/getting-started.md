# Getting started

Report a run from any harness and read it back, using the [`jsonl-file`](../bindings/jsonl-file.md) binding: one file per run, one event per line. The terms (run, event, producer, writer, reader) are in the [glossary](../SPEC.md#glossary). To carry the format over another transport, see [Writing a binding](bindings.md).

An event has an envelope (`v`, `seq`, `ts`, `run`) and a body (`type`, `tone`, the fields of the type). In this binding the process that appends is also the writer, so it sets the envelope. A run starts with `run.started` and ends with `run.finished`. Events carry no secrets, prompts or model output.

## Where run files live

All runs of one user, of every repository, go into one directory:

| Platform | Directory |
| :-- | :-- |
| Linux and macOS | `$XDG_STATE_HOME/agent-events/` when `XDG_STATE_HOME` is an absolute path, else `~/.local/state/agent-events/` |
| Windows | `%LOCALAPPDATA%\agent-events\` |
| any, when `AGENT_EVENTS_DIR` is set | the absolute directory it names |

A run is the file `<run>.jsonl` in that directory. The run id is globally unique (ULID, UUIDv7 or the like), and `run.started` says in `origin` which repository, branch, worktree and machine the run comes from. A writer outside a git repository writes there too, without `origin.repo`. Writers delete old runs of their own repository only ([retention](../bindings/jsonl-file.md#retention)).

Up to 0.2, run files lived in `<git-common-dir>/.agents/events/` of each repository. Writers no longer write there. A reader also reads that directory of the repositories it follows until 0.4, with or without `AGENT_EVENTS_DIR` ([legacy directory](../bindings/jsonl-file.md#legacy-directory)).

## Write from a shell

Source this function, call it for each event. It counts `seq` from the lines already in the file, which is correct because a run has one writer.

```sh
# writer.sh
AE_RUN="${AE_RUN:-$(date -u +%Y%m%dT%H%M%SZ)-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')}" # globally unique
ae_events_dir() { # the shared directory of the binding
  [ -z "$AGENT_EVENTS_DIR" ] || { printf '%s\n' "$AGENT_EVENTS_DIR"; return; }
  case "$(uname -s)" in MINGW* | MSYS* | CYGWIN*) printf '%s\n' "$LOCALAPPDATA/agent-events"; return ;; esac
  case "$XDG_STATE_HOME" in /*) ae_state=$XDG_STATE_HOME ;; *) ae_state=$HOME/.local/state ;; esac
  printf '%s\n' "$ae_state/agent-events"
}
ae_member() { # ae_member <name> <value>: ,"name":"value", nothing for an empty value
  [ -z "$2" ] || printf ',"%s":"%s"' "$1" "$(printf '%s' "$2" | sed 's/\\/\\\\/g; s/"/\\"/g')"
}
ae_origin() { # the "origin" member of run.started
  ae_repo=; ae_branch=; ae_tree=
  if ae_common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null); then
    ae_url=$(git remote get-url origin 2>/dev/null)
    case "$ae_url" in
      file:* | /* | .*) ;; # a local path names no host
      *://*) ae_repo=${ae_url#*://}; ae_repo=${ae_repo#*/} ;;
      *:*) ae_repo=${ae_url#*:}; ae_repo=${ae_repo#/} ;; # host:owner/repo
    esac
    ae_repo=${ae_repo%/}; ae_repo=${ae_repo%.git}
    [ -n "$ae_repo" ] || ae_repo=${ae_common%/.git}
    ae_branch=$(git symbolic-ref --quiet --short HEAD)
    ae_tree=$(git rev-parse --show-toplevel 2>/dev/null)
  fi
  ae_json="$(ae_member repo "$ae_repo")$(ae_member branch "$ae_branch")$(ae_member worktree "$ae_tree")$(ae_member host "$(uname -n)")"
  printf '"origin":{%s}' "${ae_json#,}"
}
ae_emit() { # ae_emit <type> <tone> [json members, e.g. '"done":1,"total":3']
  ae_dir=$(ae_events_dir)
  mkdir -p "$ae_dir" || return
  ae_file="$ae_dir/$AE_RUN.jsonl"
  ae_seq=$(( $(cat "$ae_file" 2>/dev/null | wc -l) + 1 ))
  printf '{"v":1,"seq":%s,"ts":"%s","run":"%s","type":"%s","tone":"%s"%s}\n' \
    "$ae_seq" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$AE_RUN" "$1" "$2" "${3:+,$3}" >> "$ae_file"
}
```

```sh
# use.sh
. ./writer.sh
ae_emit run.started neutral "\"profiles\":[],\"host\":{\"jsonl-file.pid\":\"$$\"},$(ae_origin)"
ae_emit progress neutral '"done":1,"total":3,"label":"files"'
ae_emit attention warning '"id":"a1","reason":"ci-red","needsYou":true'
ae_emit run.finished success '"outcome":"succeeded"'
```

Values you put into the members must already be valid JSON (escape quotes). Prefer reason codes (`ci-red`) over free text.

`ae_events_dir` is the [directory of the binding](#where-run-files-live). `ae_origin` says where a run comes from; it works outside a git repository too, and then leaves `repo`, `branch` and `worktree` out.

## Write from a Claude Code hook

Claude Code runs a command per hook event and passes a JSON object, with the `session_id`, on stdin. Every hook is its own process, but they run one after another, so the shell writer above is enough. The session id is the run id (a UUID matches the run id pattern). This writes no `jsonl-file.pid`, so the run is judged by file age alone.

```sh
# ae-hook.sh
. "$(dirname "$0")/writer.sh"
SID=$(sed -n 's/.*"session_id" *: *"\([^"]*\)".*/\1/p' | head -n 1)
[ -n "$SID" ] || exit 0
ae_dir=$(ae_events_dir)
# The current run of the session is the latest of <session_id>, <session_id>-2, <session_id>-3 ...
n=1; AE_RUN=$SID
while [ -e "$ae_dir/$SID-$((n + 1)).jsonl" ]; do n=$((n + 1)); AE_RUN=$SID-$n; done
finished=; tail -n 1 "$ae_dir/$AE_RUN.jsonl" 2>/dev/null | grep -q '"type":"run.finished"' && finished=1
case "$1" in
  start) # SessionStart also fires for resume, clear and compact
    if [ -e "$ae_dir/$AE_RUN.jsonl" ]; then
      [ -n "$finished" ] || exit 0 # still running: compact, or resume of a run that never ended
      AE_RUN=$SID-$((n + 1)) # resume after SessionEnd: a new run
    fi
    ae_emit run.started neutral "\"profiles\":[],\"host\":{},\"agent\":{\"harness\":\"claude-code\"},$(ae_origin)" ;;
  attention) [ -n "$finished" ] || ae_emit attention warning "\"id\":\"n$(date +%s)\",\"reason\":\"notification\",\"needsYou\":true" ;;
  end) [ -n "$finished" ] || ae_emit run.finished neutral '"outcome":"succeeded"' ;;
esac
```

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": ".claude/ae-hook.sh start" }] }],
    "Notification": [{ "hooks": [{ "type": "command", "command": ".claude/ae-hook.sh attention" }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": ".claude/ae-hook.sh end" }] }]
  }
}
```

Claude Code fires `SessionStart` for the `startup`, `resume`, `clear` and `compact` sources. `resume` and `compact` keep the `session_id`; `/clear` starts a new `session_id` (and ends the old session with a `SessionEnd` of reason `clear`). A run has exactly one `run.started` and nothing counts after `run.finished` ([SPEC.md](../SPEC.md#run-state)), so the hook picks the run per event:

- `start` does nothing while the current run file has not finished (compact, or a resume of a session that never ended).
- `start` after the current run has `run.finished` (a session resumed after `SessionEnd`) begins a new run, `<session_id>-2`, then `-3`, and so on. Each file counts its own `seq`.
- `attention` and `end` go to the current run, and are skipped once it has finished.

The hook reports that the session needs attention, not what was said. A session that is closed with Ctrl+C may never reach `SessionEnd`: the run then turns `abandoned` after an hour, which is the intended outcome.

## Write through MCP (draft)

With the [`mcp` binding](../bindings/mcp.md) the agent is a producer only. It sends the body; the MCP server is the writer and stamps `v`, `seq` and `ts`. The binding is a draft and these names may change.

```json
{ "method": "tools/call", "params": { "name": "agent_events_start", "arguments": {
  "profiles": [], "host": {}, "agent": { "harness": "codex" } } } }
```

The result carries the run id and the `seq` the server assigned: `{"run": "01JD…", "seq": 1}`. Every further event names that run:

```json
{ "method": "tools/call", "params": { "name": "agent_events_emit", "arguments": {
  "run": "01JDEXAMPLE", "type": "progress", "tone": "neutral", "done": 1, "total": 3, "label": "files" } } }
```

A producer MUST NOT send `seq`. A rejected event comes back as a tool error and uses no `seq`.

## Read a run

A reader replays the file from the start, then follows it. Only lines ended by `\n` count; an incomplete last line is read again when its newline arrives. The state is the fold of the events ([SPEC.md](../SPEC.md#run-state)).

Replay and fold with the CLI:

```sh
E=${AGENT_EVENTS_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/agent-events}  # Windows: %LOCALAPPDATA%\agent-events
cat "$E/r1.jsonl"                     # replay: the events
npx agent-events state "$E/r1.jsonl"  # the fold, as JSON
```

The same in a Node.js reader that also follows (`node reader.mjs <file> [--follow]`). It folds the whole file again on every change, which is enough for files of this size; a reader in another language folds the events and checks itself against `fixtures/state/`.

```js
// reader.mjs
import { readFileSync, watchFile } from 'node:fs'
import { fold } from 'agent-events'

const [file, flag] = process.argv.slice(2)
const show = () => console.log(JSON.stringify(fold(readFileSync(file, 'utf8'), new Date())))
show()
if (flag === '--follow') watchFile(file, { interval: 500 }, show)
```

`fold` skips the incomplete last line, ignores lines that are not JSON, and deduplicates by `seq`. Resuming after `seq` N is, for this binding, skipping the first N events of the replay.

## Worked example: two repositories and a CI run

One machine, one directory, three runs: a delivery loop in `example/api`, an agent working in a worktree of `example/web`, and a script that polls the CI of `example/api` after the merge and writes a run **on behalf of CI**. CI itself writes nothing into the directory: the script is the writer of that run, and its `origin` says where the script ran. The event types beyond the core (`merged`, `ci.run.completed`, `publish-ok`) are [events in use](profiles.md#events-in-use-deliver-and-ci).

`0193700a-1c00-7a10-8f00-00000000000a.jsonl`, the loop:

```jsonl
{"v":1,"seq":1,"ts":"2026-11-27T09:00:00Z","run":"0193700a-1c00-7a10-8f00-00000000000a","type":"run.started","tone":"neutral","profiles":[],"host":{},"origin":{"repo":"example/api","branch":"main","worktree":"/home/dev/api","host":"build-box"},"subject":{"kind":"milestone","id":"M3","title":"M3"}}
{"v":1,"seq":2,"ts":"2026-11-27T09:20:00Z","run":"0193700a-1c00-7a10-8f00-00000000000a","type":"merged","tone":"success","repo":"example/api","issue":12,"pr":"https://example.com/example/api/pull/14","risk":"low"}
{"v":1,"seq":3,"ts":"2026-11-27T09:20:01Z","run":"0193700a-1c00-7a10-8f00-00000000000a","type":"run.finished","tone":"success","outcome":"succeeded"}
```

`0193700a-2d00-7b20-8f00-00000000000b.jsonl`, the agent:

```jsonl
{"v":1,"seq":1,"ts":"2026-11-27T09:05:00Z","run":"0193700a-2d00-7b20-8f00-00000000000b","type":"run.started","tone":"neutral","profiles":[],"host":{},"origin":{"repo":"example/web","branch":"feat/7-search","worktree":"/home/dev/web-wt-7","host":"build-box"},"subject":{"kind":"task","id":"7","title":"Add search"}}
{"v":1,"seq":2,"ts":"2026-11-27T09:15:00Z","run":"0193700a-2d00-7b20-8f00-00000000000b","type":"attention","tone":"warning","id":"a1","reason":"ci-red","needsYou":true,"text":"CI is red"}
```

`0193700f-9e00-7c30-8f00-00000000000c.jsonl`, the CI run:

```jsonl
{"v":1,"seq":1,"ts":"2026-11-27T09:25:00Z","run":"0193700f-9e00-7c30-8f00-00000000000c","type":"run.started","tone":"info","profiles":["ci@1"],"host":{},"origin":{"repo":"example/api","branch":"main","worktree":"/home/dev/api","host":"build-box"},"subject":{"kind":"commit","id":"4f2a9c1d8e7b6a5f4c3d2e1f0a9b8c7d6e5f4a3b","title":"example/api@4f2a9c1","url":"https://example.com/example/api/commit/4f2a9c1d8e7b6a5f4c3d2e1f0a9b8c7d6e5f4a3b"}}
{"v":1,"seq":2,"ts":"2026-11-27T09:31:00Z","run":"0193700f-9e00-7c30-8f00-00000000000c","type":"ci.run.completed","tone":"success","ci":{"name":"release","conclusion":"success","url":"https://example.com/example/api/actions/runs/101"}}
{"v":1,"seq":3,"ts":"2026-11-27T09:31:01Z","run":"0193700f-9e00-7c30-8f00-00000000000c","type":"publish-ok","tone":"success","ci":{"tag":"v1.4.0","release":"https://example.com/example/api/releases/tag/v1.4.0"}}
{"v":1,"seq":4,"ts":"2026-11-27T09:31:02Z","run":"0193700f-9e00-7c30-8f00-00000000000c","type":"run.finished","tone":"success","outcome":"succeeded"}
```

A reader lists the directory and filters by one field of `origin` (`repo`, `branch`, `worktree` or `host`), taken from `run.started`:

```js
// runs.mjs
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fold } from 'agent-events'

const parse = (line) => {
  try {
    return JSON.parse(line)
  } catch {
    return undefined // a line that is not JSON is skipped
  }
}
const [dir, field, value] = process.argv.slice(2)
for (const name of readdirSync(dir).sort()) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.jsonl$/.test(name)) continue
  const text = readFileSync(join(dir, name), 'utf8')
  const lines = text.split('\n').slice(0, -1) // complete lines only
  const started = lines.map(parse).find((e) => e?.type === 'run.started')
  if (!started || (field && started.origin?.[field] !== value)) continue
  const { run, status, needsYou } = fold(text, new Date())
  console.log([run, started.origin?.repo ?? '-', status, needsYou ? 'needs you' : ''].join(' ').trim())
}
```

```sh
E=${AGENT_EVENTS_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/agent-events}
node runs.mjs "$E"                      # all three runs
node runs.mjs "$E" repo example/api     # the loop and the CI run
node runs.mjs "$E" repo example/web     # the agent
node runs.mjs "$E" host build-box       # everything from this machine
```

- The comparison is on the exact string. Without a remote, `origin.repo` is the absolute path of the repository.
- A run without `origin` (an older writer), or without the filtered field, matches no filter and appears only in the unfiltered list.
- To tell the CI run from the loop run of the same repository, look at `profiles` and `subject.kind` of `run.started`, not at `origin`.
- This reader reads the shared directory only. A complete reader also merges the [legacy directory](../bindings/jsonl-file.md#legacy-directory) of the repositories it follows.
