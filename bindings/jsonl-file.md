# Binding: jsonl-file

The first binding of the agent-events core ([SPEC.md](../SPEC.md)). The core is the format; this binding says how events are stored and found. Reasons: [ADR 0001](../docs/adr/0001-general-core-with-profiles-and-bindings.md). The key words MUST, SHOULD and MAY are used as in RFC 2119.

## File

- One file per run: `<run>.jsonl`, UTF-8, one event per line, terminated by `\n`.
- `<run>` is the `run` id of the events. It matches `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$` (no path separators, no leading dot, no spaces); the file name is the id plus `.jsonl`, and a reader MUST ignore files whose name does not fit.
- The file is append-only. A writer never rewrites or truncates it.
- One run has one writer process tree (the writer and its children). Two unrelated processes never write the same file.
- A writer appends each event as one whole line in a single write. A line does not exceed 16384 bytes.

## Reading

- A reader replays the file from the start and then follows it for new lines.
- A reader only handles lines ended by `\n`. An incomplete last line (no `\n` yet) is skipped, and read again once its newline has arrived.
- Lines that are not JSON are skipped (see the folding rules in the core).
- Readers never write, rename or delete run files.

## Writer pid

A writer records its process id in `host` of `run.started` as `"jsonl-file.pid": "<pid>"` (string). It is used for the lifecycle below.

## Lifecycle

A run is `running` until `run.finished`; the core decides `finished`. This binding adds when a run is `abandoned`: it has no `run.finished` and either

- the `jsonl-file.pid` of its `run.started` is no longer a live process on the reader's host, or
- the file has not changed for one hour (modification time, at the reader's clock).

A run without `jsonl-file.pid` is judged by the file age alone. A run on another host is judged by the file age alone.

## Retention

- A writer MAY delete run files that are `finished` or `abandoned` and older than 7 days (file modification time).
- A writer keeps at most 100 run files in the directory: when there are more, it deletes the oldest finished or abandoned ones first. A running run is never deleted.
- Readers never delete.

## Location

- Default directory: `<git-common-dir>/.agents/events/`, where `<git-common-dir>` is the output of `git rev-parse --git-common-dir` (resolved to an absolute path). All worktrees of a repository share one directory.
- The environment variable `AGENT_EVENTS_DIR` overrides it with an absolute directory path. When it is set and not empty, writers and readers use it and nothing else.
- A writer creates the directory when it does not exist. Outside a git repository and without `AGENT_EVENTS_DIR`, there is no location: a writer writes nothing.
- A run file is `<dir>/<run>.jsonl`.
