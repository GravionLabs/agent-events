import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const y = read('.github/workflows/release.yml')

describe('release workflow takes the version from the commits (#72)', () => {
  it('runs on push to main, no tag trigger, with write permissions', () => {
    assert.match(y, /branches: \[main\]/)
    assert.doesNotMatch(y, /tags:/)
    assert.match(y, /contents: write/)
    assert.match(y, /issues: write/)
    assert.match(y, /pull-requests: read/)
  })
  it('checks out the full history so determine-version sees the tags', () => {
    assert.match(y, /fetch-depth: 0/)
  })
  it('passes the repository GitVersion.yml and switches the conventional-commits config off', () => {
    assert.match(y, /conventional-commits: 'false'/)
    assert.match(y, /gitversion-config-file: GitVersion\.yml/)
  })
  it('GitVersion.yml raises the minor version, not the major, for ! and BREAKING CHANGE', () => {
    const g = read('GitVersion.yml')
    const rule = (k: string) => new RegExp(g.match(new RegExp(`^${k}: '(.*)'$`, 'm'))![1], 'm')
    const major = rule('major-version-bump-message')
    const minor = rule('minor-version-bump-message')
    const breaking = 'feat(spec)!: separate reason code\n\nbody\n\nBREAKING CHANGE: x\n'
    assert.equal(major.test(breaking), false)
    assert.equal(major.test('fix: x\n\n+semver: major'), true)
    assert.equal(minor.test(breaking), true)
    assert.equal(minor.test('chore!: drop'), true)
    assert.equal(minor.test('feat: add'), true)
    assert.equal(minor.test('docs: words'), false)
    assert.equal(rule('patch-version-bump-message').test('fix(x): y'), true)
  })
  it('runs the tests before the version is determined', () => {
    assert.ok(y.indexOf('run: npm test') < y.indexOf('determine-version@v1'))
  })
  it('determines the version and releases with GravionLabs/ci at @v1', () => {
    assert.match(y, /GravionLabs\/ci\/versioning\/determine-version@v1/)
    assert.match(y, /GravionLabs\/ci\/versioning\/gh-release@v1/)
    assert.doesNotMatch(y, /GravionLabs\/ci\/[^\s@]+@(main|[0-9a-f]{40})/)
  })
  it('writes the version into package files and regenerates the changelog in the release commit', () => {
    assert.match(
      y,
      /version-command: npm version "\$VERSION" --no-git-tag-version --allow-same-version/,
    )
    assert.match(y, /cliff-config: cliff\.toml/)
    assert.match(y, /update-changelog: "true"/)
    assert.match(y, /recreate-branch: release\/next/)
  })
  it('uploads the schemas and the tarball idempotently from the tagged commit', () => {
    assert.match(y, /git checkout --detach "refs\/tags\/\$TAG"/)
    assert.match(y, /gh release upload "\$TAG" --clobber schema\/v0\/\*\.json/)
    assert.match(y, /npm pack/)
  })
  it('does not use the removed manual version check or hand-made release', () => {
    assert.doesNotMatch(y, /release-notes/)
    assert.doesNotMatch(y, /gh release create/)
    assert.equal(existsSync(new URL('../src/release-notes.ts', import.meta.url)), false)
  })
})
