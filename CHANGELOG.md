# Changelog

All notable changes to agent-events are documented here.
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.3.1] — 2026-11-27

### Documentation
- Event directory, origin, CI events and the choice of binding (#91) (#98)
- Deliver and CI event names follow the profile rule (#100) (#101)


## [0.3.0] — 2026-11-27

### Bug Fixes
- **deps**: Renovate config uses the dependencyDashboard object (#92) (#93)
- **ci**: Close merged issues and keep the release pull request (#94) (#95)


### Documentation
- **adr**: Accept ADR 0005 (#85) (#87)
- Update CHANGELOG.md for v0.3.0 [skip ci]


### Features
- ⚠️ **Breaking**: **bindings**: One directory per user, origin in run.started, retention per repository (#90) (#97)
  jsonl-file writers write to $XDG_STATE_HOME/agent-events/, else ~/.local/state/agent-events/ (Windows %LOCALAPPDATA%\agent-events\), instead of <git-common-dir>/.agents/events/; AGENT_EVENTS_DIR still overrides. Readers also read the old directory until the next minor version after this release. Writers must add origin to run.started, use globally unique run ids and prune only the runs of their own repository.


## [0.2.3] — 2026-11-19

### Documentation
- Update CHANGELOG.md for v0.2.3 [skip ci]


## [0.2.2] — 2026-11-18

### Bug Fixes
- **deps**: Renovate opens its pull requests against the default branch (#78)


### Documentation
- Update CHANGELOG.md for v0.2.2 [skip ci]


## [0.2.1] — 2026-11-18

### Bug Fixes
- **deps**: 7-day minimum release age (#74)


### Documentation
- Update CHANGELOG.md for v0.2.1 [skip ci]


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
- Update CHANGELOG.md for v0.2.0 [skip ci]


### Features
- Documentation site with spec, profiles, bindings and schemas (#31) (#48)
- ⚠️ **Breaking**: **spec**: Separate reason code from human text (#37) (#50)
  reason must be a code; move sentences to text.
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



