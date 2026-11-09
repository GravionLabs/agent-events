import { posix } from 'node:path'
import type MarkdownIt from 'markdown-it'

export const repoBlob = 'https://github.com/GravionLabs/agent-events/blob/main/'

/** Repository files that are pages of the site (path in the repository, route on the site). */
export const pageRoutes: Record<string, string> = {
  'README.md': '/',
  'SPEC.md': '/SPEC',
  'docs/profiles.md': '/docs/profiles',
  'docs/subject-kinds.md': '/docs/subject-kinds',
  'bindings/jsonl-file.md': '/bindings/jsonl-file',
}

/** The pages mirror the repository layout, so a page path is the repository path of the file it includes. */
export function rewriteLink(href: string, pagePath: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#') || href.startsWith('//')) return href
  const [, pathPart = '', suffix = ''] = /^([^?#]*)(.*)$/.exec(href) ?? []
  const repoPath = posix.normalize(
    pathPart.startsWith('/') ? pathPart.slice(1) : posix.join(posix.dirname(pagePath), pathPart),
  )
  if (repoPath.startsWith('..')) return href
  if (pageRoutes[repoPath]) return pageRoutes[repoPath] + suffix
  if (repoPath.startsWith('schema/v0/')) return `/${repoPath}${suffix}`
  return repoBlob + repoPath + suffix
}

/** markdown-it plugin: rewrites the links of every page with rewriteLink. */
export function linkRewrite(md: MarkdownIt): void {
  md.core.ruler.push('agent-events-link-rewrite', (state) => {
    const pagePath: string = state.env?.relativePath ?? ''
    for (const block of state.tokens) {
      for (const token of block.children ?? []) {
        if (token.type !== 'link_open') continue
        const href = token.attrGet('href')
        if (href !== null) token.attrSet('href', rewriteLink(href, pagePath))
      }
    }
  })
}
