import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dirs: string[] = []

// node --test runs every test file in its own process, so this removes the folders of that file,
// also those of a failed test.
process.on('exit', () => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

/** A new `<temp>/<prefix>XXXXXX` folder that is removed when the test process exits. */
export function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}
