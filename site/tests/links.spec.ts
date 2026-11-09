import { createMarkdownRenderer } from 'vitepress'
import { describe, expect, it } from 'vitest'
import config from '../.vitepress/config.mts'
import { repoBlob, rewriteLink } from '../.vitepress/links.ts'

/** Renders markdown as the page at relativePath through the markdown config of the site. */
async function render(markdown: string, relativePath: string): Promise<string> {
  const md = await createMarkdownRenderer('.', config.markdown, '/')
  return md.render(markdown, { path: relativePath, relativePath })
}

describe('link rewrite of included files', () => {
  it('turns a link to an included file into a site route', async () => {
    const html = await render('[spec](../SPEC.md) [kinds](subject-kinds.md#x)', 'docs/profiles.md')
    expect(html).toContain('href="/SPEC.html"')
    expect(html).toContain('href="/docs/subject-kinds.html#x"')
  })

  it('resolves a root-relative link of the page at the root', async () => {
    const html = await render('[b](bindings/jsonl-file.md)', 'SPEC.md')
    expect(html).toContain('href="/bindings/jsonl-file.html"')
  })

  it('turns a link to any other repository file into a GitHub blob URL', async () => {
    const html = await render(
      '[adr](adr/0001-x.md) [ex](../examples/profiles/example/) [c](CHANGELOG.md)',
      'docs/profiles.md',
    )
    expect(html).toContain(`href="${repoBlob}docs/adr/0001-x.md"`)
    expect(html).toContain(`href="${repoBlob}examples/profiles/example/"`)
    expect(html).toContain(`href="${repoBlob}docs/CHANGELOG.md"`)
  })

  it('keeps external links and anchors unchanged', () => {
    expect(rewriteLink('https://example.org/a.md', 'SPEC.md')).toBe('https://example.org/a.md')
    expect(rewriteLink('#model', 'SPEC.md')).toBe('#model')
  })

  it('links the schemas to the files the site serves', () => {
    expect(rewriteLink('schema/v0/core.schema.json', 'SPEC.md')).toBe('/schema/v0/core.schema.json')
  })
})
