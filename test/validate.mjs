import { readFileSync, readdirSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

export const MAX_LINE_BYTES = 16384

const load = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'))
const ajv = new Ajv2020({ strict: false, allErrors: true })
addFormats(ajv)
const event = ajv.compile(load('schema/v0/core.schema.json'))

// Returns the list of problems of one run file; empty when valid.
export function checkRunFile(text) {
  const problems = []
  const lines = text.split('\n')
  const incompleteLast = !text.endsWith('\n') && lines.length > 0
  if (!incompleteLast) lines.pop() // trailing empty string after the last newline
  let expectedSeq = 1
  let run
  lines.forEach((line, i) => {
    const n = i + 1
    const last = incompleteLast && i === lines.length - 1
    if (Buffer.byteLength(line) > MAX_LINE_BYTES) { problems.push(`${n}: line longer than ${MAX_LINE_BYTES} bytes`); return }
    let obj
    try { obj = JSON.parse(line) } catch {
      if (!last) problems.push(`${n}: not JSON`)
      return // an incomplete last line is skipped
    }
    if (!event(obj)) { problems.push(`${n}: schema ${JSON.stringify(event.errors.map((e) => `${e.instancePath} ${e.message}`))}`); return }
    if (obj.seq !== expectedSeq) problems.push(`${n}: seq ${obj.seq}, expected ${expectedSeq}`)
    expectedSeq = obj.seq + 1
    run ??= obj.run
    if (obj.run !== run) problems.push(`${n}: run changed from ${run} to ${obj.run}`)
  })
  return problems
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0
  for (const kind of ['valid', 'invalid']) {
    const dir = new URL(`../fixtures/events/${kind}/`, import.meta.url)
    const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'))
    if (!files.length) { failed++; console.error(`no ${kind} fixtures`) }
    for (const f of files) {
      const problems = checkRunFile(readFileSync(new URL(f, dir), 'utf8'))
      if (kind === 'valid' && problems.length) { failed++; console.error(`valid/${f} rejected`, problems) }
      if (kind === 'invalid' && !problems.length) { failed++; console.error(`invalid/${f} accepted`) }
    }
  }
  console.log(failed ? `${failed} wrong` : 'all fixtures behave')
  process.exit(failed ? 1 : 0)
}
