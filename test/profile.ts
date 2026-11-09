import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import AjvModule from 'ajv/dist/2020.js'
import formatsModule from 'ajv-formats'
import { fold } from '../src/fold.ts'
import { checkRunFile } from './validate.ts'

const Ajv2020 = AjvModule as unknown as typeof AjvModule.default
const addFormats = formatsModule as unknown as typeof formatsModule.default

const read = (p: string): string => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const dir = 'examples/profiles/example'
const ajv = new Ajv2020({ strict: false, allErrors: true })
addFormats(ajv)
const profile = ajv.compile(JSON.parse(read(`${dir}/example.schema.json`)))
const run = read(`${dir}/review.jsonl`)
const events = () =>
  run
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))

describe('example profile', () => {
  it('run file is valid against the core and its rules', () =>
    assert.deepEqual(checkRunFile(run), []))
  it('every line is valid against the profile schema', () => {
    for (const e of events()) assert.ok(profile(e), JSON.stringify(profile.errors))
  })
  it('declares the profile and uses prefixed types and fields', () => {
    const e = events()
    assert.deepEqual(e[0].profiles, ['example@1'])
    assert.ok(e.some((x) => x.type === 'example.review.completed' && x.example))
  })
  it('folds to the expected core state', () => {
    const expected = JSON.parse(read(`${dir}/review.state.json`))
    assert.deepEqual(fold(run, new Date('2026-11-08T10:30:00.000Z')), expected)
  })
  it('rejects a review event without its fields', () => {
    const bad = { ...events()[3], example: { round: 1 } }
    assert.equal(profile(bad), false)
  })
  it('rejects an unknown verdict', () => {
    const bad = { ...events()[3], example: { verdict: 'maybe', round: 1 } }
    assert.equal(profile(bad), false)
  })
})
