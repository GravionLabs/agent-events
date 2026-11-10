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



