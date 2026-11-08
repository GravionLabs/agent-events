import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const FLOOR = 26
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

describe('supported Node floor is aligned (#10)', () => {
  const pkg = JSON.parse(read('package.json'))
  it('package.json engines.node is >=26', () => {
    assert.equal(pkg.engines.node, `>=${FLOOR}`)
  })
  it('@types/node matches the floor major', () => {
    assert.match(pkg.devDependencies['@types/node'], new RegExp(`^\\^${FLOOR}\\.`))
  })
  it('README names the floor', () => {
    assert.match(read('README.md'), new RegExp(`Node\\.js ${FLOOR} or newer`))
  })
  for (const f of [
    '.github/workflows/ci.yml',
    '.github/workflows/pages.yml',
    '.github/workflows/release.yml',
    'action.yml',
  ]) {
    it(`${f} uses node-version ${FLOOR}`, () => {
      const versions = [...read(f).matchAll(/node-version:\s*"?([^"\s]+)"?/g)].map((m) => m[1])
      assert.ok(versions.length > 0)
      for (const v of versions) assert.equal(v, String(FLOOR))
    })
  }
})
