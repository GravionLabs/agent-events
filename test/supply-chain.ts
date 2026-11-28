import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const workflows = readdirSync(new URL('../.github/workflows/', import.meta.url))
  .filter((f) => /\.ya?ml$/.test(f))
  .map((f) => `.github/workflows/${f}`)

describe('supply chain: release age and pinned actions (#74)', () => {
  for (const f of [...workflows, 'action.yml']) {
    it(`${f} pins foreign actions to a commit SHA with the version as comment`, () => {
      const uses = [...read(f).matchAll(/^\s*(?:-\s+)?uses:\s*(.+)$/gm)].map((m) => m[1].trim())
      for (const u of uses) {
        if (u.startsWith('./')) continue
        if (u.startsWith('GravionLabs/')) assert.match(u, /^GravionLabs\/ci[\w./-]*@v1$/)
        else assert.match(u, /^[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/)
      }
    })
  }
  it('pnpm holds a release back for 7 days', () => {
    assert.match(read('pnpm-workspace.yaml'), /^minimumReleaseAge: 10080$/m)
  })
  it('Renovate extends the shared preset and sets no minimum release age of its own', () => {
    const config = read('.github/renovate.json5')
    assert.match(config, /"github>GravionLabs\/ci"/)
    assert.doesNotMatch(config, /^\s*minimumReleaseAge\s*:/m)
  })
  it('the Renovate workflow names the repository, or Renovate ends green doing nothing', () => {
    const y = read('.github/workflows/renovate.yml')
    assert.match(y, /RENOVATE_REPOSITORIES: \$\{\{ github\.repository \}\}/)
    assert.match(y, /if: github\.repository == 'GravionLabs\/agent-events'/)
  })
})
