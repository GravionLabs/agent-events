import { readFileSync } from 'node:fs'

// Returns the body of the "## <tag>" section of a changelog, trimmed.
// Throws when the section is missing or empty.
export function extractReleaseNotes(changelog: string, tag: string): string {
  const lines = changelog.split(/\r?\n/)
  const start = lines.findIndex((l) => l.trim() === `## ${tag}`)
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
    console.error('usage: node src/release-notes.ts <tag> [changelog]')
    process.exit(2)
  }
  try {
    process.stdout.write(`${extractReleaseNotes(readFileSync(file, 'utf8'), tag)}\n`)
  } catch (e) {
    console.error(`release-notes: ${(e as Error).message}`)
    process.exit(1)
  }
}
