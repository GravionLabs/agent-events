# ADR 0006: One run directory per user, origin in run.started, retention per repository

- Status: Accepted (2026-11-27)
- Date: 2026-11-27
- Issues: #90
- Supersedes: [ADR 0001](0001-general-core-with-profiles-and-bindings.md) in part (location and retention of the `jsonl-file` binding)
- Builds on: [ADR 0004](0004-binding-contract-and-envelope-stamping.md)

## Context

ADR 0001 put the run files of the `jsonl-file` binding in `<git-common-dir>/.agents/events/`, one directory per repository.

- A reader that wants all runs of a machine has to find every repository first, and an orchestrator over several repositories follows several directories.
- A run in a temporary clone loses its events with the clone.
- The location assumes a git repository: outside one, and without `AGENT_EVENTS_DIR`, a writer writes nothing.
- The directory is the only place a reader learns the repository from. `run.started` names no repository, branch, worktree or machine.

## Decision

### Location

Writers write to one directory per user:

| Platform | Default directory |
| :-- | :-- |
| Linux | `$XDG_STATE_HOME/agent-events/` when `XDG_STATE_HOME` is set to an absolute path, else `~/.local/state/agent-events/` |
| macOS | the same XDG rule as Linux |
| Windows | `%LOCALAPPDATA%\agent-events\` |

A relative or empty `XDG_STATE_HOME` is ignored, as the XDG Base Directory specification requires.

`AGENT_EVENTS_DIR` stays the override: when it is set and not empty, writers and readers use that directory as the shared directory in place of the default. It replaces only the shared directory; readers still read the legacy directory (see Transition).

### Origin

`run.started` gets an optional object `origin`:

| Field | Meaning |
| :-- | :-- |
| `repo` | `owner/repo` from the remote, else the absolute path of the repository |
| `branch` | the branch |
| `worktree` | the absolute path of the worktree |
| `host` | the host name of the machine |

The core schema keeps `origin` and its fields optional, so runs of old writers stay valid. The `jsonl-file` binding requires it for writers in the shared directory; a field that does not exist is left out (`repo` outside a git repository). `origin.host` names the machine and is not the `host` map of display keys.

### Run ids

Run ids MUST be globally unique in the shared directory, because runs of all repositories, and of every host that shares the directory, meet there. A writer SHOULD use a ULID or a UUIDv7; another id that is unique across hosts and time, such as a session UUID, is allowed.

### Retention

Retention counts per origin repository, not per directory. A writer counts and deletes only the finished or abandoned runs of its own `origin.repo`: at most 100 per repository, and such runs older than 30 days MAY go. Runs with an `origin` but without `origin.repo` form one group of their own, which only writers without a repository prune (owner decision 2026-11-27): every writer outside a git repository, in any directory, shares this one group of at most 100 runs. A running run and the runs of other repositories are never deleted. Readers never delete. Runs without `origin` are judged by the rule of ADR 0001 (older than 7 days MAY go, at most 100 of them in the directory).

### Transition

Writers write the shared directory only. Readers also read the legacy directory `<git-common-dir>/.agents/events/` of the repositories they follow, whether or not `AGENT_EVENTS_DIR` is set (owner decision 2026-11-27), and deduplicate by `(run, seq)`, until the next minor version after the release that introduces the shared directory. Below 1.0 a breaking change raises the minor version, so that release is 0.3 and the legacy directory leaves the binding with 0.4.

Writers delete nothing in a legacy directory, and readers never delete (owner decision 2026-11-27). The files in `<git-common-dir>/.agents/events/` therefore remain after the transition; a person may remove them by hand.

## Consequences

- Easier:
  - One reader follows every run of a user in one place, without knowing the repositories.
  - Run files survive the deletion of a clone or worktree.
  - Runs outside a git repository are recorded.
  - A display groups runs by repository, branch, worktree and machine from `run.started`.
- Harder:
  - Breaking: writers and readers of other repositories move to the new location (GravionLabs/skills#1078, GravionLabs/poimen#1408). Until a reader does, it misses the runs of new writers.
  - A writer reads the `run.started` of other files to find the runs of its repository.
  - `origin` holds absolute paths and a host name. The directory belongs to one user; whoever copies run files elsewhere publishes them too.
  - `owner/repo` does not name the forge: equal names on two forges share one retention group.
  - Runs of repositories that no writer visits again stay until a person removes them.
  - Legacy directories are never pruned after the transition: their files stay in `.git` until a person removes them.
  - All writers outside a git repository share one retention group of at most 100 runs, so writers of other repositories (GravionLabs/skills#1078, GravionLabs/poimen#1417) implement this group too.
  - Processes that do not share a home directory (containers, a second user) need `AGENT_EVENTS_DIR` to meet in one directory.

## Alternatives

- **Keep one directory per repository.** No migration, but every reader keeps finding repositories, and runs die with their clone.
- **One subdirectory per repository under the user directory.** Retention stays per directory, but readers list a tree, names of repositories need an escaping rule, and `origin` would still be needed.
- **`~/Library/Application Support` on macOS.** The native place, but a second rule for the same shell tools; the owner chose the XDG rule (2026-11-27, #89).
- **A daemon that owns the directory.** Central retention and no scanning, but the apps would need a background process; readers stay plain file readers, an agent host may aggregate on top.
- **Writers write both directories during the transition.** Old readers keep working, but every writer carries two paths and every run exists twice.
