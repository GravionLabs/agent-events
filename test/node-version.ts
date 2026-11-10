import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const FLOOR = 26 // development floor: tests, CI, README, .nvmrc
const PACKAGE_FLOOR = 22 // oldest supported LTS for package users (runs compiled dist/)
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

describe('supported Node floor is aligned (#10)', () => {
  const pkg = JSON.parse(read('package.json'))
  it('package.json engines.node is the oldest supported LTS, below the development floor', () => {
    assert.equal(pkg.engines.node, `>=${PACKAGE_FLOOR}`)
  })
  it('@types/node matches the floor major', () => {
    assert.match(pkg.devDependencies['@types/node'], new RegExp(`^\\^${FLOOR}\\.`))
  })
  it('README names the floor', () => {
    assert.match(read('README.md'), new RegExp(`Node\\.js ${FLOOR} or newer`))
  })
  it('.nvmrc pins the floor, which the reusable Pages workflow reads', () => {
    assert.equal(read('.nvmrc').trim(), String(FLOOR))
    assert.match(
      read('.github/workflows/pages.yml'),
      /uses: GravionLabs\/ci\/\.github\/workflows\/vitepress-pages\.yml@v1/,
    )
  })
  it('CI runs the built CLI on the package floor and the development floor', () => {
    const ci = read('.github/workflows/ci.yml')
    assert.match(ci, new RegExp(`node: \\["${PACKAGE_FLOOR}", "${FLOOR}"\\]`))
    assert.match(ci, /node dist\/cli\.js validate "fixtures\/events\/valid/)
  })
  it('CI requires exit 1 from the built CLI on an invalid fixture (#63)', () => {
    assert.match(read('.github/workflows/ci.yml'), /fixtures\/events\/invalid\/bad-tone\.jsonl/)
  })
  for (const f of ['.github/workflows/ci.yml', '.github/workflows/release.yml', 'action.yml']) {
    it(`${f} uses node-version ${FLOOR}`, () => {
      const versions = [...read(f).matchAll(/node-version:\s*"?([^"\s]+)"?/g)]
        .map((m) => m[1])
        .filter((v) => v !== '${{')
      assert.ok(versions.length > 0)
      for (const v of versions) assert.equal(v, String(FLOOR))
    })
  }
})
