import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const cli = join(root, 'dist/cli.js')

/** The body of the fenced block whose first line is `# <marker>`. */
function block(doc: string, marker: string): string {
  const m = new RegExp(`\`\`\`\\w*\\n((?:#|//) ${marker}\\n[\\s\\S]*?)\`\`\``).exec(doc)
  assert.ok(m, `block ${marker} missing`)
  return m[1] as string
}

/** The first fenced block of a language that contains needle. */
function fenced(doc: string, lang: string, needle: string): string {
  for (const m of doc.matchAll(new RegExp(`\`\`\`${lang}\\n([\\s\\S]*?)\`\`\``, 'g'))) {
    if ((m[1] as string).includes(needle)) return m[1] as string
  }
  throw new Error(`no ${lang} block with ${needle}`)
}

const validate = (file: string) =>
  spawnSync(process.execPath, [cli, 'validate', file], { encoding: 'utf8' })
const sh = (script: string, env: Record<string, string>, input = '') =>
  spawnSync('sh', ['-c', script], {
    encoding: 'utf8',
    input,
    env: { PATH: process.env.PATH as string, ...env },
  })

const guide = read('docs/getting-started.md')

describe('getting-started writers produce valid runs', () => {
  it('the shell function writes a run the validator accepts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ae-sh-'))
    writeFileSync(join(dir, 'writer.sh'), block(guide, 'writer.sh'))
    const r = sh(`cd "${dir}" && ${block(guide, 'use.sh')}`, {
      AGENT_EVENTS_DIR: dir,
      AE_RUN: 'shell1',
    })
    assert.equal(r.status, 0, r.stderr)
    const file = join(dir, 'shell1.jsonl')
    const lines = readFileSync(file, 'utf8').trim().split('\n')
    assert.deepEqual(
      lines.map((l) => JSON.parse(l).seq),
      [1, 2, 3, 4],
    )
    const v = validate(file)
    assert.equal(v.status, 0, v.stdout + v.stderr)
  })

  it('the Claude Code hook script writes start, attention and end for the session id', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ae-hook-'))
    writeFileSync(join(dir, 'writer.sh'), block(guide, 'writer.sh'))
    writeFileSync(join(dir, 'ae-hook.sh'), block(guide, 'ae-hook.sh'))
    const stdin = '{"session_id":"7f3c-sess","hook_event_name":"x"}'
    for (const step of ['start', 'attention', 'end']) {
      const r = sh(`sh "${dir}/ae-hook.sh" ${step}`, { AGENT_EVENTS_DIR: dir }, stdin)
      assert.equal(r.status, 0, r.stderr)
    }
    const file = join(dir, '7f3c-sess.jsonl')
    const types = readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l).type)
    assert.deepEqual(types, ['run.started', 'attention', 'run.finished'])
    const v = validate(file)
    assert.equal(v.status, 0, v.stdout + v.stderr)
  })

  it('a second SessionStart (resume, compact) for the same session adds no run.started', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ae-hook-'))
    writeFileSync(join(dir, 'writer.sh'), block(guide, 'writer.sh'))
    writeFileSync(join(dir, 'ae-hook.sh'), block(guide, 'ae-hook.sh'))
    const stdin = '{"session_id":"7f3c-sess","hook_event_name":"SessionStart"}'
    for (const step of ['start', 'start', 'end']) {
      const r = sh(`sh "${dir}/ae-hook.sh" ${step}`, { AGENT_EVENTS_DIR: dir }, stdin)
      assert.equal(r.status, 0, r.stderr)
    }
    const file = join(dir, '7f3c-sess.jsonl')
    const types = readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l).type)
    assert.deepEqual(types, ['run.started', 'run.finished'])
    const v = validate(file)
    assert.equal(v.status, 0, v.stdout + v.stderr)
  })

  it('the hook does nothing without a session id', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ae-hook-'))
    writeFileSync(join(dir, 'writer.sh'), block(guide, 'writer.sh'))
    writeFileSync(join(dir, 'ae-hook.sh'), block(guide, 'ae-hook.sh'))
    const r = sh(`sh "${dir}/ae-hook.sh" start`, { AGENT_EVENTS_DIR: dir }, '{}')
    assert.equal(r.status, 0)
    assert.equal(sh(`ls "${dir}"`, {}).stdout.includes('.jsonl'), false)
  })

  it('the hook settings are valid JSON for the three hook events', () => {
    const settings = JSON.parse(fenced(guide, 'json', '"hooks"'))
    assert.deepEqual(Object.keys(settings.hooks), ['SessionStart', 'Notification', 'SessionEnd'])
  })

  it('MCP tool-call bodies become valid events once the server stamps the envelope', () => {
    const calls = [...guide.matchAll(/```json\n(\{ "method": "tools\/call"[\s\S]*?)```/g)].map(
      (m) => JSON.parse(m[1] as string).params,
    )
    assert.deepEqual(
      calls.map((c) => c.name),
      ['agent_events_start', 'agent_events_emit'],
    )
    for (const c of calls) assert.equal('seq' in c.arguments, false)
    const run = calls[1].arguments.run
    const events = calls.map((c, i) => {
      const { run: _r, ...body } = c.arguments
      const type = c.name === 'agent_events_start' ? { type: 'run.started', tone: 'neutral' } : {}
      return {
        v: 1,
        seq: i + 1,
        ts: '2026-11-10T10:00:00Z',
        run,
        ...type,
        ...body,
      }
    })
    const dir = mkdtempSync(join(tmpdir(), 'ae-mcp-'))
    const file = join(dir, `${run}.jsonl`)
    writeFileSync(file, `${events.map((e) => JSON.stringify(e)).join('\n')}\n`)
    const v = validate(file)
    assert.equal(v.status, 0, v.stdout + v.stderr)
  })
})

describe('getting-started reader', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ae-read-'))
  const file = join(dir, 'r1.jsonl')
  const events = `${read('fixtures/events/valid/run-level-steps.jsonl').trim()}\n{"v":1,"seq":4`
  writeFileSync(file, events)

  it('the Node.js reader folds the file and skips the incomplete last line', () => {
    const src = block(guide, 'reader.mjs').replace(
      "'agent-events'",
      JSON.stringify(join(root, 'dist/index.js')),
    )
    writeFileSync(join(dir, 'reader.mjs'), src)
    const r = spawnSync(process.execPath, [join(dir, 'reader.mjs'), file], {
      encoding: 'utf8',
    })
    assert.equal(r.status, 0, r.stderr)
    const state = JSON.parse(r.stdout)
    assert.equal(state.run, 'r11')
  })

  it('the documented state command prints the same fold', () => {
    assert.ok(guide.includes('npx agent-events state .git/.agents/events/r1.jsonl'))
    const r = spawnSync(process.execPath, [cli, 'state', file], {
      encoding: 'utf8',
    })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(JSON.parse(r.stdout).run, 'r11')
  })
})

describe('docs structure', () => {
  it('SPEC.md starts with a glossary of the nine terms', () => {
    const spec = read('SPEC.md')
    assert.ok(spec.indexOf('## Glossary') < spec.indexOf('## Model'))
    const glossary = spec.slice(spec.indexOf('## Glossary'), spec.indexOf('## Model'))
    for (const t of [
      'Run',
      'Event',
      'Envelope',
      'Producer',
      'Writer',
      'Reader',
      'Binding',
      'Profile',
      'Display',
    ])
      assert.ok(glossary.includes(`**${t}**`), t)
  })

  it('the binding guide has every contract section and links ADR 0004', () => {
    const doc = read('docs/bindings.md')
    for (const s of [
      'Framing',
      'Writer',
      'Discovery',
      'Replay and resume',
      'Follow',
      'Delivery',
      'Liveness',
      'Retention',
      'Limits',
      'Access',
    ])
      assert.ok(doc.includes(`| ${s} |`), s)
    assert.ok(doc.includes('adr/0004-binding-contract-and-envelope-stamping.md'))
    assert.ok(doc.includes('## Worked example: jsonl-file'))
    assert.ok(doc.includes('## Worked example: mcp'))
  })

  it('subject kinds lists url, file and jira.issue, and its examples validate as subjects', () => {
    const doc = read('docs/subject-kinds.md')
    for (const k of ['url', 'file', 'jira.issue']) assert.ok(doc.includes(`| \`${k}\` |`), k)
    const subjects = fenced(doc, 'json', 'jira.issue')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
    const dir = mkdtempSync(join(tmpdir(), 'ae-subj-'))
    const file = join(dir, 's1.jsonl')
    writeFileSync(
      file,
      subjects
        .map((subject, i) =>
          JSON.stringify({
            v: 1,
            seq: i + 1,
            ts: '2026-11-10T10:00:00Z',
            run: 's1',
            type: i === 0 ? 'run.started' : 'task.started',
            tone: 'neutral',
            ...(i === 0 ? { profiles: [], host: {} } : { task: `t${i}` }),
            subject,
          }),
        )
        .join('\n')
        .concat('\n'),
    )
    const v = validate(file)
    assert.equal(v.status, 0, v.stdout + v.stderr)
  })

  it('the README contents table links the new pages', () => {
    const readme = read('README.md')
    assert.ok(readme.includes('(docs/getting-started.md)'))
    assert.ok(readme.includes('(docs/bindings.md)'))
  })
})
