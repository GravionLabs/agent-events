import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { afterEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkRun, hasErrors } from '../src/check.ts'
import { main } from '../src/cli.ts'

const path = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))
const read = (p: string) => readFileSync(path(p), 'utf8')

// Runs the CLI in process and collects its output.
async function run(args: string[], stdin = '') {
  const out: string[] = []
  const err: string[] = []
  const code = await main(args, {
    out: (s) => out.push(s),
    err: (s) => err.push(s),
    stdin: () => stdin,
  })
  return { code, out, err }
}

const ev = (seq: number, type: string, extra = '') =>
  `{"v":1,"seq":${seq},"ts":"2026-11-08T10:00:0${seq}.000Z","run":"r1","type":"${type}","tone":"neutral"${extra}}\n`
const started = ev(1, 'run.started', ',"profiles":[],"host":{}')

describe('writer fixtures', () => {
  for (const kind of ['valid', 'invalid'] as const) {
    const dir = `fixtures/events/${kind}`
    for (const f of readdirSync(path(dir)).filter((x) => x.endsWith('.jsonl'))) {
      it(`${kind}/${f}`, async () => {
        const { code, out } = await run(['validate', path(`${dir}/${f}`)])
        assert.equal(code, kind === 'valid' ? 0 : 1, out.join('\n'))
        assert.equal(hasErrors(checkRun(read(`${dir}/${f}`))), kind === 'invalid')
      })
    }
  }
})

describe('checks', () => {
  it('reports a gap in seq with the line', () => {
    const f = checkRun(started + ev(3, 'run.finished', ',"outcome":"succeeded"'))
    assert.deepEqual(f, [{ line: 2, level: 'error', message: 'seq 3, expected 2' }])
  })
  it('requires run.started first', () => {
    const f = checkRun(ev(1, 'run.finished', ',"outcome":"succeeded"'))
    assert.equal(f[0]?.message, 'first event is run.finished, expected run.started')
  })
  it('rejects a second run.started', () => {
    const f = checkRun(started + ev(2, 'run.started', ',"profiles":[],"host":{}'))
    assert.deepEqual(
      f.map((x) => x.message),
      ['run.started is not the first event'],
    )
  })
  it('rejects two runs in one file', () => {
    const other = ev(2, 'run.finished', ',"outcome":"succeeded"').replace('"r1"', '"r2"')
    assert.deepEqual(
      checkRun(started + other).map((x) => x.message),
      ['run changed from r1 to r2'],
    )
  })
  it('reports an incomplete last line as a note only', () => {
    const f = checkRun(`${started}{"v":1,"seq":2,"ts`)
    assert.deepEqual(f, [{ line: 2, level: 'note', message: 'incomplete last line skipped' }])
  })
  it('reports a broken middle line as an error', () => {
    const f = checkRun(`${started}nope\n${ev(3, 'run.finished', ',"outcome":"succeeded"')}`)
    assert.equal(f[0]?.message, 'not JSON')
  })
  it('rejects an empty file', () => {
    assert.deepEqual(
      checkRun('').map((x) => x.message),
      ['file has no events'],
    )
  })
  it('rejects a line over 16384 bytes', () => {
    const f = checkRun(`${'x'.repeat(16385)}\n`)
    assert.match(f[0]?.message ?? '', /longer than 16384/)
  })
})

describe('example profile', () => {
  const dir = 'examples/profiles/example'
  const schema = path(`${dir}/example.schema.json`)
  it('accepts the example run with its profile', async () => {
    const { code, out } = await run(['validate', path(`${dir}/review.jsonl`), '--profile', schema])
    assert.deepEqual([code, out], [0, []])
  })
  it('rejects a review without verdict', async () => {
    const bad = read(`${dir}/review.jsonl`).replace(/"verdict":"[a-z-]+",?/, '')
    const { code, out } = await run(['validate', '-', '--profile', schema], bad)
    assert.equal(code, 1)
    assert.match(out.join('\n'), /^<stdin>:\d+: error: schema/)
  })
  it('fails on an unreadable profile', async () => {
    const { code, err } = await run(['validate', '-', '--profile', '/no/such.json'], started)
    assert.equal(code, 1)
    assert.match(err[0] ?? '', /^profile:/)
  })
})

describe('declared profiles', () => {
  const dir = 'examples/profiles/example'
  const schema = path(`${dir}/example.schema.json`)
  const review = path(`${dir}/review.jsonl`)
  const url = 'https://example.invalid/profiles/example/v1/example.schema.json'
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })
  const stub = (respond: (u: string) => Response) => {
    const calls: string[] = []
    globalThis.fetch = (async (u: string) => {
      calls.push(String(u))
      return respond(String(u))
    }) as typeof fetch
    return calls
  }
  const exampleSchema = () => Response.json(JSON.parse(read(`${dir}/example.schema.json`)))

  it('fetches the declared URL and applies it', async () => {
    const calls = stub(exampleSchema)
    const ok = await run(['validate', review, '--declared-profiles'])
    assert.deepEqual([ok.code, ok.out, calls], [0, [], [url]])
    const bad = read(`${dir}/review.jsonl`).replace(/"verdict":"[a-z-]+",?/, '')
    const res = await run(['validate', '-', '--declared-profiles'], bad)
    assert.equal(res.code, 1)
    assert.match(res.out.join('\n'), /error: schema/)
  })
  it('fetches nothing without the flag', async () => {
    const calls = stub(exampleSchema)
    const { code } = await run(['validate', review])
    assert.deepEqual([code, calls], [0, []])
  })
  it('lets a --profile with the same $id replace the fetch', async () => {
    const calls = stub(() => new Response('', { status: 500 }))
    const { code, out } = await run([
      'validate',
      review,
      '--declared-profiles',
      '--profile',
      schema,
    ])
    assert.deepEqual([code, out, calls], [0, [], []])
  })
  it('caches a URL across files', async () => {
    const calls = stub(exampleSchema)
    const { code } = await run(['validate', review, review, '--declared-profiles'])
    assert.deepEqual([code, calls], [0, [url]])
  })
  it('prints profile: <url>: … and exits 1 when the fetch fails', async () => {
    stub(() => new Response('', { status: 404 }))
    const { code, err } = await run(['validate', review, '--declared-profiles'])
    assert.equal(code, 1)
    assert.equal(err[0], `profile: ${url}: HTTP 404`)
  })
  it('rejects a declared local path or http URL without reading or fetching', async () => {
    const calls = stub(exampleSchema)
    for (const value of ['/etc/hostname', 'http://example.invalid/x.schema.json']) {
      const text = started.replace(
        '"profiles":[]',
        `"profiles":[],"profileSchemas":{"a@1":"${value}"}`,
      )
      const { code, err } = await run(['validate', '-', '--declared-profiles'], text)
      assert.deepEqual([code, err, calls], [1, [`profile: ${value}: not an https URL`], []])
    }
  })
  it('reports a fetched schema that is not a valid JSON Schema', async () => {
    stub(() => Response.json({ type: 'nonsense' }))
    const { code, err } = await run(['validate', review, '--declared-profiles'])
    assert.equal(code, 1)
    assert.match(err[0] ?? '', new RegExp(`^profile: ${url}: .+`))
  })
  it('does nothing for a file without profileSchemas', async () => {
    const calls = stub(exampleSchema)
    const { code } = await run(['validate', '-', '--declared-profiles'], started)
    assert.deepEqual([code, calls], [0, []])
  })
})

describe('cli', () => {
  it('prints findings as file:line: level: message', async () => {
    const { out } = await run(['validate', '-'], `${started}{"v":1`)
    assert.deepEqual(out, ['<stdin>:2: note: incomplete last line skipped'])
  })
  it('expands a glob', async () => {
    const { code, out } = await run(['validate', path('fixtures/events/valid/*.jsonl')])
    assert.deepEqual([code, out.filter((l) => l.includes('error'))], [0, []])
  })
  it('fails when a glob matches nothing', async () => {
    assert.equal((await run(['validate', path('fixtures/none/*.jsonl')])).code, 1)
  })
  it('fails on a missing file', async () => {
    const { code, out } = await run(['validate', '/no/such.jsonl'])
    assert.equal(code, 1)
    assert.match(out[0] ?? '', /error: ENOENT/)
  })
  it('prints usage without arguments or with an unknown command', async () => {
    assert.equal((await run([])).code, 1)
    assert.equal((await run(['validate'])).code, 1)
    assert.equal((await run(['--help'])).code, 0)
  })
  it('built binary runs with exit code and stdin', () => {
    const bin = path('dist/cli.js')
    const ok = spawnSync('node', [bin, 'validate', '-'], { input: started })
    assert.equal(ok.status, 0)
    const bad = spawnSync('node', [bin, 'validate', '-'], {
      input: ev(2, 'run.finished', ',"outcome":"succeeded"'),
    })
    assert.equal(bad.status, 1)
    assert.match(execFileSync('node', [bin, '--help']).toString(), /Usage: agent-events validate/)
  })
})
