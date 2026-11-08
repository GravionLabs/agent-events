import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { extractReleaseNotes } from '../src/release-notes.ts'

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

describe('release notes come from CHANGELOG.md (#22)', () => {
  const log =
    '# Changelog\n\n## Unreleased\n\n## v0.2.0\n\n- two\n\n## v0.1.0\n\n- one\n- npm: wait\n'
  it('extracts only the section of the tag', () => {
    assert.equal(extractReleaseNotes(log, 'v0.1.0'), '- one\n- npm: wait')
    assert.equal(extractReleaseNotes(log, 'v0.2.0'), '- two')
  })
  it('fails clearly when the section is missing', () => {
    assert.throws(() => extractReleaseNotes(log, 'v9.9.9'), /no section "## v9\.9\.9"/)
  })
  it('fails when the section is empty', () => {
    assert.throws(() => extractReleaseNotes(log, 'Unreleased'), /empty/)
  })
  it('the real v0.1.0 section carries the npm decision', () => {
    assert.match(
      extractReleaseNotes(read('CHANGELOG.md'), 'v0.1.0'),
      /npm publish: decision to wait/,
    )
  })
  it('release.yml passes the notes via --notes-file, not --generate-notes', () => {
    const y = read('.github/workflows/release.yml')
    assert.match(y, /--notes-file/)
    assert.doesNotMatch(y, /--generate-notes/)
  })
})
