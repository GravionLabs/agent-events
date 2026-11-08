import { readFileSync, readdirSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const load = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'))
const ajv = new Ajv2020({ strict: false, allErrors: true })
addFormats(ajv)
const event = ajv.compile(load('schema/progress-event.schema.json'))
const state = ajv.compile(load('schema/deliver-run-state.schema.json'))

let failed = 0
const dir = new URL('../fixtures/', import.meta.url)
for (const f of readdirSync(dir)) {
  const text = readFileSync(new URL(f, dir), 'utf8')
  if (f.endsWith('.jsonl')) {
    const lines = text.split('\n').filter(Boolean)
    lines.forEach((line, i) => {
      let obj
      try { obj = JSON.parse(line) } catch { return } // incomplete last line is allowed
      if (!event(obj)) { failed++; console.error(`${f}:${i + 1}`, event.errors) }
    })
  } else if (f.endsWith('.state.json')) {
    if (!state(JSON.parse(text))) { failed++; console.error(f, state.errors) }
  }
}
console.log(failed ? `${failed} invalid` : 'all fixtures valid')
process.exit(failed ? 1 : 0)
