# Changelog

All notable changes to agent-events are documented here.
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.3.0] — 2026-11-27

### Bug Fixes
- **deps**: Renovate config uses the dependencyDashboard object (#92) (#93)
- **ci**: Close merged issues and keep the release pull request (#94) (#95)


### Documentation
- **adr**: Accept ADR 0005 (#85) (#87)


### Features
- ⚠️ **Breaking**: **bindings**: One directory per user, origin in run.started, retention per repository (#90) (#97)
  jsonl-file writers write to $XDG_STATE_HOME/agent-events/, else ~/.local/state/agent-events/ (Windows %LOCALAPPDATA%\agent-events\), instead of <git-common-dir>/.agents/events/; AGENT_EVENTS_DIR still overrides. Readers also read the old directory until the next minor version after this release. Writers must add origin to run.started, use globally unique run ids and prune only the runs of their own repository.



