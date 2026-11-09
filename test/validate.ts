import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { checkRun, hasErrors } from '../src/check.ts'

// Returns the error messages of one run file, from the single validator in src/check.ts; empty when valid.
export function checkRunFile(text: string): string[] {
  return checkRun(text)
    .filter((f) => f.level === 'error')
    .map((f) => `${f.line}: ${f.message}`)
}

for (const kind of ['valid', 'invalid'] as const) {
  describe(`${kind} fixtures`, () => {
    const dir = new URL(`../fixtures/events/${kind}/`, import.meta.url)
    const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'))
    it('exist', () => assert.ok(files.length > 0, `no ${kind} fixtures`))
    for (const f of files) {
      it(f, () => {
        const problems = checkRunFile(readFileSync(new URL(f, dir), 'utf8'))
        if (kind === 'valid') assert.deepEqual(problems, [], `valid/${f} rejected`)
        else assert.ok(problems.length > 0, `invalid/${f} accepted`)
      })
    }
  })
}

describe('run.started position', () => {
  const ev = (seq: number, type: string) =>
    `{"v":1,"seq":${seq},"ts":"2026-11-08T10:00:0${seq}.000Z","run":"r1","type":"${type}","tone":"neutral"${type === 'run.started' ? ',"profiles":[],"host":{}' : type === 'run.finished' ? ',"outcome":"succeeded"' : ''}}\n`
  it('accepts run.started first and once', () =>
    assert.deepEqual(checkRunFile(ev(1, 'run.started')), []))
  it('rejects a first event that is not run.started', () =>
    assert.match(checkRunFile(ev(1, 'run.finished')).join(), /1: .*expected run\.started/))
  it('rejects a second run.started', () =>
    assert.match(
      checkRunFile(ev(1, 'run.started') + ev(2, 'run.started')).join(),
      /2: run\.started is not the first event/,
    ))
})

describe('profileSchemas', () => {
  const start = (extra: string) =>
    `{"v":1,"seq":1,"ts":"2026-11-08T10:00:00.000Z","run":"r1","type":"run.started","tone":"neutral","host":{}${extra}}\n`
  const url = 'https://example.com/a.schema.json'
  it('accepts a declared profile with an https URL', () => {
    const f = checkRun(start(`,"profiles":["a@1"],"profileSchemas":{"a@1":"${url}"}`))
    assert.deepEqual(f, [])
  })
  it('notes a key that is not in profiles', () => {
    const f = checkRun(start(`,"profiles":[],"profileSchemas":{"a@1":"${url}"}`))
    assert.deepEqual(f, [
      { line: 1, level: 'note', message: 'profileSchemas key a@1 is not in profiles' },
    ])
  })
  for (const [name, map] of [
    ['http URL', `{"a@1":"http://example.com/a.json"}`],
    ['file URL', `{"a@1":"file:///a.json"}`],
    ['relative path', `{"a@1":"a.json"}`],
    ['bad key', `{"A":"${url}"}`],
    ['not an object', `["${url}"]`],
  ]) {
    it(`rejects ${name}`, () => {
      const f = checkRun(start(`,"profiles":["a@1"],"profileSchemas":${map}`))
      assert.equal(hasErrors(f), true)
    })
  }
})
