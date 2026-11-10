# Getting started

Report a run from any harness and read it back, using the [`jsonl-file`](../bindings/jsonl-file.md) binding: one file per run, one event per line. The terms (run, event, producer, writer, reader) are in the [glossary](../SPEC.md#glossary). To carry the format over another transport, see [Writing a binding](bindings.md).

An event has an envelope (`v`, `seq`, `ts`, `run`) and a body (`type`, `tone`, the fields of the type). In this binding the process that appends is also the writer, so it sets the envelope. A run starts with `run.started` and ends with `run.finished`. Events carry no secrets, prompts or model output.

## Write from a shell

Source this function, call it for each event. It counts `seq` from the lines already in the file, which is correct because a run has one writer.

```sh
# writer.sh
AE_RUN="${AE_RUN:-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
ae_emit() { # ae_emit <type> <tone> [json members, e.g. '"done":1,"total":3']
  ae_dir="${AGENT_EVENTS_DIR:-$(git rev-parse --path-format=absolute --git-common-dir)/.agents/events}"
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
ae_emit run.started neutral "\"profiles\":[],\"host\":{\"jsonl-file.pid\":\"$$\"}"
ae_emit progress neutral '"done":1,"total":3,"label":"files"'
ae_emit attention warning '"id":"a1","reason":"ci-red","needsYou":true'
ae_emit run.finished success '"outcome":"succeeded"'
```

Values you put into the members must already be valid JSON (escape quotes). Prefer reason codes (`ci-red`) over free text.

## Write from a Claude Code hook

Claude Code runs a command per hook event and passes a JSON object, with the `session_id`, on stdin. Every hook is its own process, but they run one after another, so the shell writer above is enough. The session id is the run id (a UUID matches the run id pattern). This writes no `jsonl-file.pid`, so the run is judged by file age alone.

```sh
# ae-hook.sh
. "$(dirname "$0")/writer.sh"
SID=$(sed -n 's/.*"session_id" *: *"\([^"]*\)".*/\1/p' | head -n 1)
[ -n "$SID" ] || exit 0
ae_dir="${AGENT_EVENTS_DIR:-$(git rev-parse --path-format=absolute --git-common-dir)/.agents/events}"
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
    ae_emit run.started neutral '"profiles":[],"host":{},"agent":{"harness":"claude-code"}' ;;
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
E=$(git rev-parse --path-format=absolute --git-common-dir)/.agents/events  # not always .git/
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

`fold` skips the incomplete last line, ignores lines that are not JSON, and deduplicates by `seq`. Resuming after `seq` N is, for this binding, skipping the first N events of the replay. Run files live in `<git-common-dir>/.agents/events/`, or in `AGENT_EVENTS_DIR` when it is set.
