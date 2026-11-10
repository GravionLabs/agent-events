import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

describe('action default version (#36)', () => {
  const action = read('action.yml')
  it('does not default version to an npm tag (package is not on npm)', () => {
    const block = action.match(/\n {2}version:\n((?: {4}.*\n)+)/)?.[1] ?? ''
    assert.ok(block, 'version input exists')
    assert.doesNotMatch(block, /default:\s*latest/)
    assert.match(block, /default: ""/)
  })
  it('without version builds the CLI from the checkout of the action itself', () => {
    assert.match(action, /github\.action_path/)
    assert.match(action, /npm ci/)
    assert.match(action, /npm run build/)
  })
  it('with version still installs that npm version', () => {
    assert.match(action, /agent-events@\$\{VERSION\}/)
  })
  it('ci runs the action with defaults against fixtures/events/valid', () => {
    const ci = read('.github/workflows/ci.yml')
    assert.match(ci, /uses: \.\/\n\s+with:\n\s+files: fixtures\/events\/valid\/\*\.jsonl/)
  })
  it('README documents the default', () => {
    assert.match(read('README.md'), /default: the CLI of the Action's own ref/)
  })
})
