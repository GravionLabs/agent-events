import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { checkVersion } from '../src/release-notes.ts'

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const log =
  '# Changelog\n\n## [0.2.0] — 2026-01-02\n\n### Features\n- two\n\n## [0.1.0] — 2026-01-01\n\n- one\n'
const pkg = (v: string) => JSON.stringify({ version: v })

describe('release version check and workflow (#32)', () => {
  it('accepts a package version with a generated changelog section', () => {
    assert.equal(checkVersion(pkg('0.2.0'), log), 'v0.2.0')
  })
  it('fails when package.json and the changelog differ', () => {
    assert.throws(() => checkVersion(pkg('0.3.0'), log), /no section "## v0\.3\.0"/)
  })
  it('fails on a version that is not x.y.z', () => {
    assert.throws(() => checkVersion(pkg('1.0'), log), /not x\.y\.z/)
  })
  it('the real package.json matches the real CHANGELOG.md', () => {
    assert.match(checkVersion(read('package.json'), read('CHANGELOG.md')), /^v\d+\.\d+\.\d+$/)
  })
  it('dry run: the --check step prints the tag and exits 0 in this repo', () => {
    const out = execFileSync('node', ['src/release-notes.ts', '--check'], { encoding: 'utf8' })
    assert.equal(out.trim(), `v${JSON.parse(read('package.json')).version}`)
  })
  it('release.yml runs on push to main, creates tag via release, no tag trigger', () => {
    const y = read('.github/workflows/release.yml')
    assert.match(y, /branches: \[main\]/)
    assert.doesNotMatch(y, /tags:/)
    assert.match(y, /--target "\$GITHUB_SHA"/)
    assert.match(y, /schema\/v0\/\*\.json/)
    assert.match(y, /--notes-file/)
  })
})
