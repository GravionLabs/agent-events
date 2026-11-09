import { cpSync, mkdirSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Copies schema/v0/*.json into public/schema/v0/ so that the site serves them at the $id path.
const from = new URL('../../schema/v0/', import.meta.url)
const to = new URL('../public/schema/v0/', import.meta.url)
mkdirSync(to, { recursive: true })
for (const f of readdirSync(from).filter((n) => n.endsWith('.json'))) {
  cpSync(fileURLToPath(new URL(f, from)), fileURLToPath(new URL(f, to)))
}
