import { readFileSync } from 'node:fs'

// A heading "## v1.2.3", "## 1.2.3" or git-cliff's "## [1.2.3] — 2026-01-01" belongs to the tag.
function isSectionOf(line: string, tag: string): boolean {
  const m = /^## \[?([^\]\s]+)\]?(\s.*)?$/.exec(line.trim())
  if (!m) return false
  const strip = (v: string) => v.replace(/^v/, '')
  return strip(m[1]) === strip(tag)
}

// Throws when package.json's version has no CHANGELOG section (or an empty one).
export function checkVersion(packageJson: string, changelog: string): string {
  const { version } = JSON.parse(packageJson) as { version?: string }
  if (!version || !/^\d+\.\d+\.\d+$/.test(version))
    throw new Error(`package.json version "${version}" is not x.y.z`)
  extractReleaseNotes(changelog, `v${version}`)
  return `v${version}`
}

// Returns the body of the "## <tag>" section of a changelog, trimmed.
// Throws when the section is missing or empty.
export function extractReleaseNotes(changelog: string, tag: string): string {
  const lines = changelog.split(/\r?\n/)
  const start = lines.findIndex((l) => isSectionOf(l, tag))
  if (start === -1) throw new Error(`CHANGELOG.md has no section "## ${tag}"`)
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l))
  if (end === -1) end = lines.length
  const body = lines
    .slice(start + 1, end)
    .join('\n')
    .trim()
  if (body === '') throw new Error(`CHANGELOG.md section "## ${tag}" is empty`)
  return body
}

if (import.meta.main) {
  const [tag, file = 'CHANGELOG.md'] = process.argv.slice(2)
  if (!tag) {
    console.error('usage: node src/release-notes.ts <tag|--check> [changelog]')
    process.exit(2)
  }
  try {
    if (tag === '--check') {
      // prints the tag of package.json's version after checking it against the changelog
      console.log(checkVersion(readFileSync('package.json', 'utf8'), readFileSync(file, 'utf8')))
      process.exit(0)
    }
    process.stdout.write(`${extractReleaseNotes(readFileSync(file, 'utf8'), tag)}\n`)
  } catch (e) {
    console.error(`release-notes: ${(e as Error).message}`)
    process.exit(1)
  }
}
