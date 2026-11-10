# Conventional subject kinds

`subject.kind` is free text. These values are a convention with a prefix per system; they are not required, and a reader shows an unknown kind generically (title and `url`). A kind outside this list is valid.

| Kind | System object | `id` convention |
| :-- | :-- | :-- |
| `github.issue` | GitHub issue | `owner/repo#number` |
| `github.pull-request` | GitHub pull request | `owner/repo#number` |
| `github.milestone` | GitHub milestone | `owner/repo#number` |
| `gitlab.issue` | GitLab issue | `group/project#iid` |
| `gitlab.milestone` | GitLab milestone | `group/project#id` |
| `jira.issue` | Jira issue | the issue key, `PROJ-123` |
| `url` | any web page | the URL itself |
| `file` | a file of the working tree | the path relative to the repository root |

A display may offer a dedicated view for a kind it knows (a milestone panel for `github.milestone`) and fetch more through `subject.url`; that is a feature of the display, not of the format. The generic kinds `url` and `file` have no system prefix: use them when the subject is not an object of a system. `url` needs `subject.url` (it MUST match `^https?://`) and repeats it as `id`. A `file` has no `url`, since the `file:` scheme is not allowed in a URL field; the display shows the `id`.

```json
{"kind":"jira.issue","id":"PROJ-123","title":"Export fails on empty runs","url":"https://example.atlassian.net/browse/PROJ-123"}
{"kind":"url","id":"https://example.org/design","title":"Design doc","url":"https://example.org/design"}
{"kind":"file","id":"docs/bindings.md","title":"Binding guide"}
```

To add a kind, use `<system>.<object>` in lower case with hyphens.
