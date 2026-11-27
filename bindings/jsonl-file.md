# Binding: jsonl-file

The first binding of the agent-events core ([SPEC.md](../SPEC.md)). The core is the format; this binding says how events are stored and found. Reasons: [ADR 0001](../docs/adr/0001-general-core-with-profiles-and-bindings.md); location, origin and retention: [ADR 0006](../docs/adr/0006-one-run-directory-per-user.md) (Proposed). The key words MUST, SHOULD and MAY are used as in RFC 2119.

## File

- One file per run: `<run>.jsonl`, UTF-8, one event per line, terminated by `\n`.
- Run ids MUST be globally unique, because the runs of all repositories meet in one directory. A writer SHOULD use a ULID or a UUIDv7; another id that is unique across hosts and time, such as a session UUID, is allowed.
- `<run>` is the `run` id of the events. It matches `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$` (no path separators, no leading dot, no spaces); the file name is the id plus `.jsonl`, and a reader MUST ignore files whose name does not fit.
- The file is append-only. A writer never rewrites or truncates it.
- One run has one writer process tree (the writer and its children). Two unrelated processes never write the same file.
- A writer appends each event as one whole line in a single write. A line does not exceed 16384 bytes.

## Reading

- A reader replays the file from the start and then follows it for new lines.
- A reader only handles lines ended by `\n`. An incomplete last line (no `\n` yet) is skipped, and read again once its newline has arrived.
- Lines that are not JSON are skipped (see the folding rules in the core).
- Readers never write, rename or delete run files.

## Origin

A writer MUST add `origin` to `run.started`, with every field that exists for the run. All values are strings; a field that does not exist is left out, never empty.

| Field | Value |
| :-- | :-- |
| `origin.repo` | `owner/repo`: the path of the URL of the remote `origin` without the leading `/` and the `.git` suffix. Without such a remote, or when its URL names no host (a local path, `file:`), the absolute path of the repository: the directory that holds `<git-common-dir>` when that is named `.git`, else `<git-common-dir>`. The same for all worktrees. Left out outside a git repository. |
| `origin.branch` | the checked out branch; left out when `HEAD` is detached or outside a git repository |
| `origin.worktree` | the absolute path of the worktree (`git rev-parse --show-toplevel`); left out without a worktree |
| `origin.host` | the host name of the machine |

`<git-common-dir>` is the output of `git rev-parse --git-common-dir`, resolved to an absolute path. `origin.host` is the machine and differs from the `host` map of display keys. Runs of older writers have no `origin`; readers accept them.

## Writer pid

A writer records its process id in `host` of `run.started` as `"jsonl-file.pid": "<pid>"` (string). It is used for the lifecycle below.

## Lifecycle

A run is `running` until `run.finished`; the core decides `finished`. This binding adds when a run is `abandoned`: it has no `run.finished` and either

- the `jsonl-file.pid` of its `run.started` is no longer a live process on the reader's host, or
- the file has not changed for one hour (modification time, at the reader's clock).

A run without `jsonl-file.pid` is judged by the file age alone. A run on another host (`origin.host` is not the host name of the reader's machine) is judged by the file age alone.

## Retention

Retention counts per repository, not per directory. The repository of a run is the `origin.repo` of its `run.started`; two runs belong to one repository when the strings are equal.

- A writer counts and deletes only the `finished` or `abandoned` runs of its own `origin.repo`.
- Such runs older than 30 days (file modification time) MAY be deleted.
- A writer keeps at most 100 finished or abandoned runs per repository: when there are more, it deletes the oldest of its repository first.
- A writer without `origin.repo` treats the runs that have an `origin` but no `origin.repo` as its own, under the same rules.
- A running run is never deleted. The runs of other repositories are never deleted.
- Runs without `origin` (older writers, or no readable `run.started`) belong to no repository, and any writer judges them: `finished` or `abandoned` ones older than 7 days MAY be deleted, and at most 100 files of runs without `origin` are kept, the oldest finished or abandoned ones deleted first.
- A writer deletes nothing in a legacy directory (below).
- Readers never delete.

## Location

Writers and readers share one directory per user:

| Platform | Default directory |
| :-- | :-- |
| Linux and macOS | `$XDG_STATE_HOME/agent-events/` when `XDG_STATE_HOME` is set to an absolute path, else `~/.local/state/agent-events/` |
| Windows | `%LOCALAPPDATA%\agent-events\` |

- The environment variable `AGENT_EVENTS_DIR` overrides it with an absolute directory path. When it is set and not empty, writers and readers use it and nothing else, no legacy directory either.
- This directory (default or override) is the *shared directory*. A run file is `<dir>/<run>.jsonl`.
- A writer creates the directory when it does not exist. Writers write the shared directory only.
- A writer outside a git repository writes to the shared directory too, and omits `origin.repo`.

### Legacy directory

Up to 0.2, run files lived in `<git-common-dir>/.agents/events/`, one directory per repository.

- Without `AGENT_EVENTS_DIR`, a reader also reads this directory of every repository it follows.
- A run is listed once, also when both directories hold its file. The reader deduplicates its events by `(run, seq)`, taking the event of the shared directory when both have the `seq`, and folds them in `seq` order. The age of the run is that of the newer file.
- This holds until the next minor version after the release that introduces the shared directory: readers of 0.3 read the legacy directory, from 0.4 it is no longer part of this binding.

## Directory fixtures

[`fixtures/directory/`](../fixtures/directory/README.md) holds directories with the expected result: which runs a reader lists and which files a writer may delete.
