# Conventional subject kinds

`subject.kind` is free text. These values are a convention with a prefix per system; they are not required, and a reader shows an unknown kind generically (title and `url`). A kind outside this list is valid.

| Kind | System object | `id` convention |
| :-- | :-- | :-- |
| `github.issue` | GitHub issue | `owner/repo#number` |
| `github.pull-request` | GitHub pull request | `owner/repo#number` |
| `github.milestone` | GitHub milestone | `owner/repo#number` |
| `gitlab.issue` | GitLab issue | `group/project#iid` |
| `gitlab.milestone` | GitLab milestone | `group/project#id` |

A display may offer a dedicated view for a kind it knows (a milestone panel for `github.milestone`) and fetch more through `subject.url`; that is a feature of the display, not of the format. To add a kind, use `<system>.<object>` in lower case with hyphens.
