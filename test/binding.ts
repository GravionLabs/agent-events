import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const binding = read('bindings/jsonl-file.md')
const spec = read('SPEC.md')

test('binding states file, lifecycle, retention and location rules', () => {
  for (const needle of [
    'append-only',
    'one writer process tree',
    'incomplete last line',
    'replays the file from the start and then follows',
    '`abandoned`',
    'one hour',
    '7 days',
    'at most 100',
    'Readers never delete',
    '30 days',
    'per repository',
    'origin.repo',
    '$XDG_STATE_HOME/agent-events/',
    '~/.local/state/agent-events/',
    '%LOCALAPPDATA%\\agent-events\\',
    'globally unique',
    '<git-common-dir>/.agents/events/',
    'AGENT_EVENTS_DIR',
    'whether or not `AGENT_EVENTS_DIR` is set',
    'replaces only the shared directory',
    '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$',
  ]) {
    assert.ok(binding.toLowerCase().includes(needle.toLowerCase()), needle)
  }
})

test('SPEC links the binding and carries no transport rule', () => {
  assert.ok(spec.includes('(bindings/jsonl-file.md)'))
  for (const banned of [
    'append-only',
    'writer process tree',
    'incomplete last line',
    'follows it',
  ]) {
    assert.ok(!spec.includes(banned), banned)
  }
})
