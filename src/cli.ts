#!/usr/bin/env node
import { globSync, readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { checkRun, compileSchemas, declaredSchemas, hasErrors } from './check.ts'
import { fold } from './fold.ts'

const USAGE = `Usage: agent-events validate <file|glob|-> [more files] [--profile <path|url>]... [--declared-profiles]

Checks run files (JSON Lines) against the core schema, the given profile schemas and
the file rules. Findings print one per line as <file>:<line>: <error|note>: <message>.
--declared-profiles also fetches every https URL of profileSchemas in the run.started of
each file (no network access without it); a --profile schema with the same $id replaces the fetch.
Exit code: 0 when no error (notes allowed), 1 on errors or bad usage.

Usage: agent-events state <file|-> [--now <ts>]

Prints the run state (the reference fold of SPEC.md "Run state") of a run file as JSON.
--now <ts> (RFC 3339) is the reader's clock for the abandoned status; default: the current time.`

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

function state(args: string[], io: Io): number {
  let target: string | undefined
  let now = new Date()
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    if (a === '--now') {
      const value = args[++i]
      const parsed = value === undefined ? new Date(Number.NaN) : new Date(value)
      if (Number.isNaN(parsed.getTime())) {
        io.err('--now needs an RFC 3339 timestamp')
        return 1
      }
      now = parsed
    } else if (target === undefined) target = a
    else {
      io.err(USAGE)
      return 1
    }
  }
  if (target === undefined) {
    io.err(USAGE)
    return 1
  }
  let text: string
  try {
    text = target === '-' ? io.stdin() : readFileSync(target, 'utf8')
  } catch (e) {
    io.err(`${target}: ${(e as Error).message}`)
    return 1
  }
  io.out(JSON.stringify(fold(text, now), null, 2))
  return 0
}

// Runs the CLI; returns the exit code.
export async function main(argv: string[], io: Io = defaultIo): Promise<number> {
  const [command, ...rest] = argv
  if (command === '--help' || command === '-h') {
    io.out(USAGE)
    return 0
  }
  if (command === 'state') return state(rest, io)
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
  for (let i = 0; i < profiles.length; i++) {
    try {
      compileSchemas(profiles.slice(0, i + 1)) // duplicate $id, unresolvable $ref, invalid schema
    } catch (e) {
      io.err(`${profileSources[i]}: error: ${(e as Error).message}`)
      return 1
    }
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
          compileSchemas([...fileProfiles, loaded]) // throws on an invalid schema or a duplicate $id
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

/**
 * True when this module is the process entry point. import.meta.main only exists from
 * Node 22.18, so compare real paths instead (resolves npm's bin symlinks).
 */
export function isEntry(argv1: string | undefined, moduleUrl: string): boolean {
  if (!argv1) return false
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl))
  } catch {
    return false
  }
}

if (isEntry(process.argv[1], import.meta.url)) process.exitCode = await main(process.argv.slice(2))
