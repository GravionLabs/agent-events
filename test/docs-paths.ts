import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

describe('validate examples use the directory the binding writes to', () => {
  for (const f of ['README.md', 'action.yml']) {
    it(`${f} does not name the legacy .agents/events directory`, () => {
      assert.doesNotMatch(read(f), /\.agents\/events/)
    })
  }
  it('README.md validates files of the per-user directory', () => {
    assert.match(read('README.md'), /agent-events validate "\$E\/\*\.jsonl"/)
  })
})

describe('profile guide shows the real validator call', () => {
  const guide = read('docs/profiles.md')
  it('does not describe a state before the CLI', () => {
    assert.doesNotMatch(guide, /Until the validator CLI exists/)
  })
  it('shows the validate call and it passes on the example profile', () => {
    const cmd = 'npx agent-events validate review.jsonl --profile example.schema.json'
    assert.ok(guide.includes(cmd))
    const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url))
    const cwd = fileURLToPath(new URL('../examples/profiles/example/', import.meta.url))
    const r = spawnSync(
      process.execPath,
      [cli, ...cmd.replace('npx agent-events ', '').split(' ')],
      { cwd, encoding: 'utf8' },
    )
    assert.equal(r.status, 0, r.stderr)
  })
})
