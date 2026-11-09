import { readFileSync } from 'node:fs'
import type { ValidateFunction } from 'ajv/dist/2020.js'
import AjvModule from 'ajv/dist/2020.js'
import formatsModule from 'ajv-formats'

// Both packages are CommonJS; under nodenext their default import is typed as the module object.
const Ajv2020 = AjvModule as unknown as typeof AjvModule.default
const addFormats = formatsModule as unknown as typeof formatsModule.default

export const MAX_LINE_BYTES = 16384

export type Finding = { line: number; level: 'error' | 'note'; message: string }

export const coreSchema = (): object =>
  JSON.parse(
    readFileSync(new URL('../schema/v0/core.schema.json', import.meta.url), 'utf8'),
  ) as object

// Compiles the core schema and any profile schemas; every line must satisfy all of them.
export function compileSchemas(profiles: object[] = []): ValidateFunction[] {
  const ajv = new Ajv2020({ strict: false, allErrors: true })
  addFormats(ajv)
  return [coreSchema(), ...profiles].map((schema) => ajv.compile(schema))
}

type Event = {
  seq: number
  run: string
  type: string
  profiles?: unknown
  profileSchemas?: unknown
}

// The profileSchemas map of the run.started on the first line (key to URL); empty when absent or unreadable.
export function declaredSchemas(text: string): Record<string, string> {
  try {
    const first = JSON.parse(text.split('\n')[0] ?? '') as Event
    const map = first.type === 'run.started' ? first.profileSchemas : undefined
    if (typeof map !== 'object' || map === null || Array.isArray(map)) return {}
    return Object.fromEntries(
      Object.entries(map).filter((e): e is [string, string] => typeof e[1] === 'string'),
    )
  } catch {
    return {}
  }
}

// Checks the text of one run file; returns the findings in line order.
export function checkRun(text: string, profiles: object[] = []): Finding[] {
  const validators = compileSchemas(profiles)
  const findings: Finding[] = []
  const error = (line: number, message: string) => findings.push({ line, level: 'error', message })
  if (text === '') {
    error(0, 'file has no events')
    return findings
  }
  const lines = text.split('\n')
  const incompleteLast = !text.endsWith('\n')
  if (!incompleteLast) lines.pop() // empty string after the last newline
  let expectedSeq = 1
  let run: string | undefined
  let runChanged = false
  let first = true
  lines.forEach((line, i) => {
    const n = i + 1
    const isFirst = first
    first = false
    const last = incompleteLast && i === lines.length - 1
    if (Buffer.byteLength(line) > MAX_LINE_BYTES) {
      error(n, `line longer than ${MAX_LINE_BYTES} bytes`)
      return
    }
    let obj: Event
    try {
      obj = JSON.parse(line) as Event
    } catch {
      if (last) findings.push({ line: n, level: 'note', message: 'incomplete last line skipped' })
      else error(n, 'not JSON')
      return
    }
    let valid = true
    for (const v of validators) {
      if (v(obj)) continue
      valid = false
      for (const e of v.errors ?? []) error(n, `schema: ${e.instancePath || '/'} ${e.message}`)
    }
    if (!valid) return
    if (obj.type === 'run.started' && typeof obj.profileSchemas === 'object') {
      const declared = Array.isArray(obj.profiles) ? obj.profiles : []
      for (const key of Object.keys(obj.profileSchemas as object))
        if (!declared.includes(key))
          findings.push({
            line: n,
            level: 'note',
            message: `profileSchemas key ${key} is not in profiles`,
          })
    }
    if (isFirst && obj.type !== 'run.started')
      error(n, `first event is ${obj.type}, expected run.started`)
    if (!isFirst && obj.type === 'run.started') error(n, 'run.started is not the first event')
    if (obj.seq !== expectedSeq) error(n, `seq ${obj.seq}, expected ${expectedSeq}`)
    expectedSeq = obj.seq + 1
    run ??= obj.run
    if (obj.run !== run) {
      if (!runChanged) error(n, `run changed from ${run} to ${obj.run}`)
      runChanged = true
    }
  })
  return findings
}

export const hasErrors = (findings: Finding[]): boolean => findings.some((f) => f.level === 'error')
