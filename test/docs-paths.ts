import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

describe('validate examples use the directory the binding writes to', () => {
  for (const f of ['README.md', 'action.yml']) {
    it(`${f} has no bare .agents/events path`, () => {
      assert.doesNotMatch(read(f), /(?<![\w./])\.agents\/events/)
    })
    it(`${f} points at .git/.agents/events`, () => {
      assert.match(read(f), /\.git\/\.agents\/events\/(\*\.jsonl|r1\.jsonl)/)
    })
  }
})
