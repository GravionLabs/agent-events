import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { checkRun } from '../src/check.ts'

// The directory rules of bindings/jsonl-file.md, checked against fixtures/directory/. This is not a
// reader of the package: it is the smallest code that gives the fixtures a meaning.

type Event = { seq: number; type: string; origin?: { repo?: string } }
type File = { path: string; run: string; ageMs: number; events: Event[] }
type Expected = {
  now: string
  files: Record<string, { mtime: string }>
  runs?: { run: string; repo?: string; status: string; seqs: number[] }[]
  writer?: { repo?: string }
  mayDelete?: string[]
}

const root = new URL('../fixtures/directory/', import.meta.url)
const cases = readdirSync(root, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
const DAY = 86_400_000
const HOUR = 3_600_000

const paths = (name: string) =>
  ['shared', 'legacy'].flatMap((dir) => {
    const url = new URL(`${name}/${dir}/`, root)
    return existsSync(url) ? readdirSync(url).map((f) => `${dir}/${f}`) : []
  })

function load(name: string) {
  const expected = JSON.parse(
    readFileSync(new URL(`${name}/expected.json`, root), 'utf8'),
  ) as Expected
  const files: File[] = paths(name).map((path) => ({
    path,
    run: path.slice(path.indexOf('/') + 1, -'.jsonl'.length),
    ageMs: Date.parse(expected.now) - Date.parse(expected.files[path]?.mtime ?? ''),
    events: readFileSync(new URL(`${name}/${path}`, root), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Event),
  }))
  return { expected, files }
}

const status = (events: Event[], ageMs: number) =>
  events.some((e) => e.type === 'run.finished')
    ? 'finished'
    : ageMs > HOUR
      ? 'abandoned'
      : 'running'

/** One entry per run; of a (run, seq) in both directories the shared event wins. */
function list(files: File[]) {
  return [...new Set(files.map((f) => f.run))].sort().map((run) => {
    const own = files
      .filter((f) => f.run === run)
      .sort((a, b) => Number(a.path.startsWith('shared/')) - Number(b.path.startsWith('shared/')))
    const bySeq = new Map(own.flatMap((f) => f.events.map((e) => [e.seq, e] as const)))
    const events = [...bySeq.values()].sort((a, b) => a.seq - b.seq)
    const repo = events[0]?.origin?.repo
    return {
      run,
      ...(repo === undefined ? {} : { repo }),
      status: status(events, Math.min(...own.map((f) => f.ageMs))),
      seqs: events.map((e) => e.seq),
    }
  })
}

/** The files of the shared directory a writer may delete. */
function mayDelete(files: File[], writer: { repo?: string }) {
  const done = files
    .filter((f) => f.path.startsWith('shared/') && status(f.events, f.ageMs) !== 'running')
    .sort((a, b) => b.ageMs - a.ageMs) // oldest first
  const own = done.filter((f) => {
    const origin = f.events[0]?.origin
    return origin !== undefined && origin.repo === writer.repo
  })
  const old = done.filter((f) => f.events[0]?.origin === undefined)
  const withoutOrigin = files.filter(
    (f) => f.path.startsWith('shared/') && f.events[0]?.origin === undefined,
  )
  const pick = (group: File[], days: number, excess: number) =>
    group.filter((f, i) => f.ageMs > days * DAY || i < excess)
  return [...pick(own, 30, own.length - 100), ...pick(old, 7, withoutOrigin.length - 100)]
    .map((f) => f.path)
    .sort()
}

describe('directory fixtures', () => {
  it('has the three cases and a README that names each', () => {
    assert.deepEqual(cases.sort(), [
      'retention-per-repository',
      'shared-and-legacy',
      'two-repositories',
    ])
    const readme = readFileSync(new URL('README.md', root), 'utf8')
    for (const c of cases) assert.ok(readme.includes(`| \`${c}\` |`), c)
  })

  for (const name of cases) {
    describe(name, () => {
      const { expected, files } = load(name)
      it('lists every run file with its mtime', () => {
        assert.deepEqual(Object.keys(expected.files).sort(), paths(name).sort())
        assert.ok(files.every((f) => Number.isFinite(f.ageMs) && f.ageMs >= 0))
        assert.ok(expected.runs ?? expected.mayDelete, 'no expected result')
      })
      it('holds valid run files named after their run', () => {
        for (const f of files) {
          const text = readFileSync(new URL(`${name}/${f.path}`, root), 'utf8')
          assert.deepEqual(checkRun(text), [], f.path)
          assert.equal(JSON.parse(text.split('\n')[0] ?? '').run, f.run, f.path)
        }
      })
      if (expected.runs)
        it('lists the expected runs', () => assert.deepEqual(list(files), expected.runs))
      if (expected.mayDelete)
        it('allows the writer to delete exactly the expected files', () =>
          assert.deepEqual(mayDelete(files, expected.writer ?? {}), expected.mayDelete))
    })
  }
})

describe('retention cap', () => {
  const runs = (n: number, repo: string): File[] =>
    Array.from({ length: n }, (_, i) => ({
      path: `shared/${repo}-${String(i).padStart(3, '0')}.jsonl`,
      run: `${repo}-${i}`,
      ageMs: DAY - i * 1000, // index 0 is the oldest
      events: [
        { seq: 1, type: 'run.started', origin: { repo } },
        { seq: 2, type: 'run.finished' },
      ],
    }))
  it('deletes nothing at 100 runs of a repository, whatever others hold', () => {
    assert.deepEqual(mayDelete([...runs(100, 'a'), ...runs(101, 'b')], { repo: 'a' }), [])
  })
  it('deletes the oldest of its own repository above 100', () => {
    assert.deepEqual(mayDelete(runs(102, 'a'), { repo: 'a' }), [
      'shared/a-000.jsonl',
      'shared/a-001.jsonl',
    ])
  })
})
