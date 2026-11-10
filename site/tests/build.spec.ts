import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

const site = fileURLToPath(new URL('..', import.meta.url))
const dist = join(site, '.vitepress', 'dist')
const schemaDir = fileURLToPath(new URL('../../schema/v0/', import.meta.url))
const schemas = readdirSync(schemaDir).filter((f) => f.endsWith('.json'))

/** Every file below dir, as paths relative to dir with / separators. */
function listFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`],
  )
}

beforeAll(() => {
  execFileSync('npm', ['run', 'build'], { cwd: site, stdio: 'pipe' })
}, 180_000)

describe('the built site', () => {
  it('has at least one schema to publish', () => {
    expect(schemas.length).toBeGreaterThan(0)
  })

  it.each(schemas)('serves schema/v0/%s', (file) => {
    expect(existsSync(join(dist, 'schema', 'v0', file))).toBe(true)
  })

  it('has the spec, profile, subject kind and binding pages', () => {
    const files = listFiles(dist)
    expect(files).toEqual(
      expect.arrayContaining([
        'index.html',
        'SPEC.html',
        'docs/profiles.html',
        'docs/subject-kinds.html',
        'docs/getting-started.html',
        'docs/bindings.html',
        'bindings/jsonl-file.html',
      ]),
    )
  })

  it('does not publish ADRs or other docs', () => {
    const docs = listFiles(dist).filter((f) => f.startsWith('docs/'))
    expect(docs.sort()).toEqual([
      'docs/bindings.html',
      'docs/getting-started.html',
      'docs/profiles.html',
      'docs/subject-kinds.html',
    ])
    expect(listFiles(dist).filter((f) => /adr/i.test(f))).toEqual([])
  })
})
