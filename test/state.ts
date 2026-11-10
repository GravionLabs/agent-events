import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import AjvModule from 'ajv/dist/2020.js'
import formatsModule from 'ajv-formats'
import { fold } from '../src/fold.ts'

const Ajv2020 = AjvModule as unknown as typeof AjvModule.default
const addFormats = formatsModule as unknown as typeof formatsModule.default

const root = new URL('../', import.meta.url)
const ajv = new Ajv2020({ strict: false, allErrors: true })
addFormats(ajv)
const stateSchema = ajv.compile(
  JSON.parse(readFileSync(new URL('schema/v0/run-state.schema.json', root), 'utf8')),
)

// The reader's clock is fixed per fixture: <case>.now (RFC 3339) or just after the last event.
const dir = new URL('fixtures/state/', root)
const cases = readdirSync(dir)
  .filter((f) => f.endsWith('.jsonl'))
  .map((f) => f.slice(0, -'.jsonl'.length))

describe('state fixtures', () => {
  it('exist', () => assert.ok(cases.length > 0))
  for (const c of cases) {
    it(c, () => {
      const text = readFileSync(new URL(`${c}.jsonl`, dir), 'utf8')
      const nowFile = new URL(`${c}.now`, dir)
      const now = new Date(
        existsSync(nowFile) ? readFileSync(nowFile, 'utf8').trim() : '2026-11-08T10:30:00.000Z',
      )
      const expected = JSON.parse(readFileSync(new URL(`${c}.state.json`, dir), 'utf8'))
      assert.ok(stateSchema(expected), JSON.stringify(stateSchema.errors))
      assert.deepEqual(fold(text, now), expected)
    })
  }
})

describe('package export', () => {
  it('exposes fold from the entry point', async () => {
    const index = await import('../src/index.ts')
    assert.equal(index.fold, fold)
    assert.equal(index.ABANDONED_AFTER_MS, 3600000)
  })
})
