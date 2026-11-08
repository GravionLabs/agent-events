import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import AjvModule from 'ajv/dist/2020.js'
import formatsModule from 'ajv-formats'

// Both packages are CommonJS; under nodenext their default import is typed as the module object.
const Ajv2020 = AjvModule as unknown as typeof AjvModule.default
const addFormats = formatsModule as unknown as typeof formatsModule.default

export const MAX_LINE_BYTES = 16384

const load = (p: string): object =>
  JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'))
const ajv = new Ajv2020({ strict: false, allErrors: true })
addFormats(ajv)
const event = ajv.compile(load('schema/v0/core.schema.json'))

// Returns the list of problems of one run file; empty when valid.
export function checkRunFile(text: string): string[] {
  const problems: string[] = []
  const lines = text.split('\n')
  const incompleteLast = !text.endsWith('\n') && lines.length > 0
  if (!incompleteLast) lines.pop() // trailing empty string after the last newline
  let expectedSeq = 1
  let run: unknown
  lines.forEach((line, i) => {
    const n = i + 1
    const last = incompleteLast && i === lines.length - 1
    if (Buffer.byteLength(line) > MAX_LINE_BYTES) {
      problems.push(`${n}: line longer than ${MAX_LINE_BYTES} bytes`)
      return
    }
    let obj: { seq: number; run: unknown }
    try {
      obj = JSON.parse(line)
    } catch {
      if (!last) problems.push(`${n}: not JSON`)
      return // an incomplete last line is skipped
    }
    if (!event(obj)) {
      problems.push(
        `${n}: schema ${JSON.stringify((event.errors ?? []).map((e) => `${e.instancePath} ${e.message}`))}`,
      )
      return
    }
    if (obj.seq !== expectedSeq) problems.push(`${n}: seq ${obj.seq}, expected ${expectedSeq}`)
    expectedSeq = obj.seq + 1
    run ??= obj.run
    if (obj.run !== run) problems.push(`${n}: run changed from ${run} to ${obj.run}`)
  })
  return problems
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
