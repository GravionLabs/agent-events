# Changelog

All notable changes to agent-events are documented here.
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.2.0] — 2026-11-10

### Bug Fixes
- **fold**: Open tasks move to finished.cancelled on run.finished (#35) (#46)
- **action**: Default version builds the Action's own ref instead of npm latest (#36) (#49)
- **schema**: Restrict link and subject URLs to http and https (#39) (#52)
- **cli**: Entry check works on Node 22.0 to 22.17, CI requires exit 1 on an invalid fixture (#63) (#64)
- **site**: Bindings/mcp.md is a site page (#62) (#65)
- **docs**: Claude Code hook example writes a second run.started on resume (#61) (#66)
- **cli**: Report a profile schema that cannot be compiled (#67) (#68)
- **docs**: Start a new run when a session resumes after SessionEnd (#69) (#70)
- **release**: Take the version from the conventional commits via GitVersion (#72)
- **release**: Breaking changes raise the minor version below 1.0 (#72)
- **release**: Breaking changes raise the minor version below 1.0 (#72)
- **release**: Main yields the plain version (#72)


### Documentation
- **readme**: Describe agent-events as a transport-free format (#44) (#57)
- **adr**: Binding contract and envelope stamping, draft mcp binding
- **adr**: Renumber binding contract ADR to 0004 (#58)
- Guides for bindings, writers and readers, glossary (#45) (#60)


### Features
- Documentation site with spec, profiles, bindings and schemas (#31) (#48)
- ⚠️ **Breaking**: **spec**: Separate reason code from human text (#37) (#50)
- **spec**: Steps without a task (#38) (#51)
- **spec**: Find a declared profile's schema (#40) (#53)
- **schema**: Progress done not above total, non-empty subject title (#41) (#54)
- **cli**: Export the reference fold and add agent-events state (#43) (#56)


## [0.1.0] — 2026-11-08

### Release notes

- Schemas are served on GitHub Pages under `https://gravionlabs.github.io/agent-events/schema/v0/` (workflow `pages.yml`); a test checks that each `$id` equals its served path.
- CI (`ci.yml`) runs typecheck, lint, format check, schema, fixture and validator tests on every push and pull request.
- A push to `main` runs `release.yml`, which creates the tag `v<version>` and the GitHub release with `schema/v0/*.json` and the `npm pack` tarball as assets.
- npm publish: decision to wait. Publishing needs an npm token that is not configured yet; `agent-events` 0.1.0 is not on npm, and the GitHub Action `version: latest` input needs it. Until then install with `npm install github:GravionLabs/agent-events#v0.1.0` (the `prepare` script builds `dist/` on a git install) or from the `agent-events-<version>.tgz` attached to the GitHub release.

### Bug Fixes
- Align the supported Node floor to 26 across package, CI and action (#19)
- Spec, fixtures and tests enforce run.started first and once (#18) (#20)
- Validate examples and action hint use a path the binding never writes (#21) (#24)
- **docs**: Profile guide shows the validate CLI call (#23) (#26)
- **release**: Put the CHANGELOG section of the tag into the release body (#22) (#27)
- **package**: The documented CLI install path from the release or repository works (#28) (#29)


### Documentation
- **adr**: General core with profiles and bindings
- **adr**: Displays are core readers
- **adr**: Run subject and known subject kinds
- **binding**: Jsonl-file binding (#13)
- **profiles**: Profile guide with example profile (#14)


### Features
- Initial agent-events spec, schemas and fixtures
- **schema**: Core event schema and core spec (#9)
- **schema**: Core run state schema, folding rules and reader fixtures (#12)
- **cli**: Agent-events validate and GitHub Action (#6) (#15)



