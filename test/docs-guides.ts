import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { hostname, tmpdir } from 'node:os'
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

  it('a session resumed after SessionEnd starts a new run that folds and validates', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ae-hook-'))
    writeFileSync(join(dir, 'writer.sh'), block(guide, 'writer.sh'))
    writeFileSync(join(dir, 'ae-hook.sh'), block(guide, 'ae-hook.sh'))
    const stdin = '{"session_id":"7f3c-sess","hook_event_name":"x"}'
    for (const step of ['start', 'end', 'start', 'attention']) {
      const r = sh(`sh "${dir}/ae-hook.sh" ${step}`, { AGENT_EVENTS_DIR: dir }, stdin)
      assert.equal(r.status, 0, r.stderr)
    }
    const types = (f: string) =>
      readFileSync(join(dir, f), 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l).type)
    assert.deepEqual(types('7f3c-sess.jsonl'), ['run.started', 'run.finished'])
    assert.deepEqual(types('7f3c-sess-2.jsonl'), ['run.started', 'attention'])
    for (const f of ['7f3c-sess.jsonl', '7f3c-sess-2.jsonl']) {
      const v = validate(join(dir, f))
      assert.equal(v.status, 0, v.stdout + v.stderr)
    }
    const st = spawnSync(process.execPath, [cli, 'state', join(dir, '7f3c-sess-2.jsonl')], {
      encoding: 'utf8',
    })
    const state = JSON.parse(st.stdout)
    assert.equal(state.run, '7f3c-sess-2')
    assert.equal(state.status, 'running')
    assert.equal(JSON.stringify(state).includes('notification'), true)
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

describe('getting-started location and origin', () => {
  const git = (cwd: string, ...args: string[]) => {
    const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
  }
  /** Runs use.sh in cwd and returns the origin of the run.started found in eventsDir. */
  const originOf = (cwd: string, env: Record<string, string>, eventsDir: string) => {
    const scripts = mkdtempSync(join(tmpdir(), 'ae-loc-'))
    writeFileSync(join(scripts, 'writer.sh'), block(guide, 'writer.sh'))
    const use = block(guide, 'use.sh').replace('./writer.sh', `"${scripts}/writer.sh"`)
    const r = sh(`cd "${cwd}" && ${use}`, { AE_RUN: 'loc1', ...env })
    assert.equal(r.status, 0, r.stderr)
    const file = join(eventsDir, 'loc1.jsonl')
    const v = validate(file)
    assert.equal(v.status, 0, v.stdout + v.stderr)
    return JSON.parse(readFileSync(file, 'utf8').split('\n')[0] as string).origin
  }
  const temp = () => realpathSync(mkdtempSync(join(tmpdir(), 'ae-repo-')))
  const repo = () => {
    const dir = temp()
    git(dir, 'init', '--quiet', '--initial-branch=topic')
    return dir
  }

  it('writes to ~/.local/state/agent-events by default', () => {
    const home = temp()
    originOf(temp(), { HOME: home }, join(home, '.local/state/agent-events'))
  })
  it('writes to XDG_STATE_HOME/agent-events when it is set', () => {
    const state = temp()
    originOf(temp(), { HOME: temp(), XDG_STATE_HOME: state }, join(state, 'agent-events'))
  })
  it('ignores a relative XDG_STATE_HOME', () => {
    const home = temp()
    const env = { HOME: home, XDG_STATE_HOME: 'state' }
    originOf(temp(), env, join(home, '.local/state/agent-events'))
  })
  it('names only the host outside a git repository', () => {
    const dir = temp()
    const origin = originOf(dir, { AGENT_EVENTS_DIR: dir, GIT_CEILING_DIRECTORIES: tmpdir() }, dir)
    assert.deepEqual(origin, { host: hostname() })
  })
  for (const url of [
    'https://example.com/example/a.git',
    'ssh://git@example.com:22/example/a',
    'git@example.com:example/a.git',
  ]) {
    it(`takes owner/repo from the remote ${url}`, () => {
      const dir = repo()
      git(dir, 'remote', 'add', 'origin', url)
      assert.deepEqual(originOf(dir, { AGENT_EVENTS_DIR: dir }, dir), {
        repo: 'example/a',
        branch: 'topic',
        worktree: dir,
        host: hostname(),
      })
    })
  }
  for (const url of [undefined, '/srv/git/a.git', 'file:///srv/git/a.git']) {
    it(`takes the path of the repository with remote ${url}`, () => {
      const dir = repo()
      if (url) git(dir, 'remote', 'add', 'origin', url)
      assert.equal(originOf(dir, { AGENT_EVENTS_DIR: dir }, dir).repo, dir)
    })
  }
  it('escapes quotes and backslashes in a path', () => {
    const dir = join(temp(), 'a"b\\c')
    mkdirSync(dir)
    git(dir, 'init', '--quiet')
    const events = temp()
    assert.equal(
      originOf(dir.replace(/["\\]/g, '\\$&'), { AGENT_EVENTS_DIR: events }, events).worktree,
      dir,
    )
  })
  it('generates a different run id per writer', () => {
    const dir = temp()
    writeFileSync(join(dir, 'writer.sh'), block(guide, 'writer.sh'))
    const id = () => sh(`. "${dir}/writer.sh"; printf %s "$AE_RUN"`, {}).stdout
    const [a, b] = [id(), id()]
    assert.match(a, /^\d{8}T\d{6}Z-[0-9a-f]{16}$/)
    assert.notEqual(a, b)
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
    assert.ok(guide.includes('npx agent-events state "$E/r1.jsonl"'))
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
