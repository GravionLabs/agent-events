#!/usr/bin/env node
import { globSync, readFileSync } from 'node:fs'
import { checkRun, compileSchemas, declaredSchemas, hasErrors } from './check.ts'

const USAGE = `Usage: agent-events validate <file|glob|-> [more files] [--profile <path|url>]... [--declared-profiles]

Checks run files (JSON Lines) against the core schema, the given profile schemas and
the file rules. Findings print one per line as <file>:<line>: <error|note>: <message>.
--declared-profiles also fetches every https URL of profileSchemas in the run.started of
each file (no network access without it); a --profile schema with the same $id replaces the fetch.
Exit code: 0 when no error (notes allowed), 1 on errors or bad usage.`

type Io = { out: (s: string) => void; err: (s: string) => void; stdin: () => string }

const defaultIo: Io = {
  out: (s) => process.stdout.write(`${s}\n`),
  err: (s) => process.stderr.write(`${s}\n`),
  stdin: () => readFileSync(0, 'utf8'),
}

async function loadProfile(source: string): Promise<object> {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source)
    if (!res.ok) throw new Error(`${source}: HTTP ${res.status}`)
    return (await res.json()) as object
  }
  return JSON.parse(readFileSync(source, 'utf8')) as object
}

const isGlob = (s: string) => /[*?[\]{}]/.test(s)

// Runs the CLI; returns the exit code.
export async function main(argv: string[], io: Io = defaultIo): Promise<number> {
  const [command, ...rest] = argv
  if (command === '--help' || command === '-h') {
    io.out(USAGE)
    return 0
  }
  if (command !== 'validate') {
    io.err(USAGE)
    return 1
  }
  const targets: string[] = []
  const profileSources: string[] = []
  let declared = false
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] as string
    if (a === '--profile') {
      const value = rest[++i]
      if (!value) {
        io.err('--profile needs a path or URL')
        return 1
      }
      profileSources.push(value)
    } else if (a === '--declared-profiles') declared = true
    else targets.push(a)
  }
  if (targets.length === 0) {
    io.err(USAGE)
    return 1
  }
  let profiles: object[]
  try {
    profiles = await Promise.all(profileSources.map(loadProfile))
  } catch (e) {
    io.err(`profile: ${(e as Error).message}`)
    return 1
  }
  const files = targets.flatMap((t) => (t !== '-' && isGlob(t) ? globSync(t).sort() : [t]))
  if (files.length === 0) {
    io.err(`no file matches ${targets.join(' ')}`)
    return 1
  }
  const givenIds = new Set(
    profiles.map((p) => (p as { $id?: unknown }).$id).filter((x) => typeof x === 'string'),
  )
  const cache = new Map<string, Promise<object>>()
  let failed = false
  for (const file of files) {
    let text: string
    try {
      text = file === '-' ? io.stdin() : readFileSync(file, 'utf8')
    } catch (e) {
      io.out(`${file}:0: error: ${(e as Error).message}`)
      failed = true
      continue
    }
    const fileProfiles = [...profiles]
    if (declared) {
      const urls = new Set(Object.values(declaredSchemas(text)))
      for (const url of urls) {
        if (givenIds.has(url)) continue
        if (!/^https:\/\//.test(url)) {
          io.err(`profile: ${url}: not an https URL`)
          failed = true
          continue
        }
        try {
          let schema = cache.get(url)
          if (!schema) {
            schema = loadProfile(url)
            cache.set(url, schema)
          }
          const loaded = await schema
          compileSchemas([loaded]) // throws on a schema that is not a valid JSON Schema
          fileProfiles.push(loaded)
        } catch (e) {
          io.err(`profile: ${url}: ${(e as Error).message.replace(`${url}: `, '')}`)
          failed = true
        }
      }
    }
    const findings = checkRun(text, fileProfiles)
    for (const f of findings)
      io.out(`${file === '-' ? '<stdin>' : file}:${f.line}: ${f.level}: ${f.message}`)
    if (hasErrors(findings)) failed = true
  }
  return failed ? 1 : 0
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2))
