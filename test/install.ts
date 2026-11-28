import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { tempDir } from './temp.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const validDir = join(root, 'fixtures/events/valid')
const fixture = join(validDir, readdirSync(validDir)[0])

describe('install from a packed tarball', () => {
  it('ships a working agent-events bin', () => {
    const work = tempDir('ae-install-')
    try {
      const packDir = join(work, 'pack')
      const project = join(work, 'project')
      mkdirSync(packDir)
      mkdirSync(project)
      execFileSync('pnpm', ['pack', '--pack-destination', packDir], { cwd: root, stdio: 'pipe' })
      const tarball = join(packDir, readdirSync(packDir)[0])
      execFileSync('pnpm', ['add', tarball], { cwd: project, stdio: 'pipe' })
      const r = spawnSync('pnpm', ['exec', 'agent-events', 'validate', fixture], {
        cwd: project,
        encoding: 'utf8',
      })
      assert.equal(r.status, 0, r.stderr + r.stdout)
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  })
})
