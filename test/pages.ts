import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const base = 'https://gravionlabs.github.io/agent-events/'
const dir = new URL('../schema/v0/', import.meta.url)
const files = readdirSync(dir).filter((f) => f.endsWith('.json'))

describe('schema $id matches the Pages path', () => {
  it('publishes at least the core and run state schemas', () => {
    assert.deepEqual(files, ['core.schema.json', 'run-state.schema.json'])
  })
  for (const f of files) {
    it(`${f} has $id ${base}schema/v0/${f}`, () => {
      const schema = JSON.parse(readFileSync(new URL(f, dir), 'utf8'))
      assert.equal(schema.$id, `${base}schema/v0/${f}`)
    })
  }
})
