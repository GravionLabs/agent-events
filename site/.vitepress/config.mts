import { defineConfig } from 'vitepress'
import { linkRewrite } from './links.ts'

// `/<repository>/` on GitHub Pages; the workflow sets SITE_BASE.
const base = process.env['SITE_BASE'] ?? '/'

export default defineConfig({
  title: 'agent-events',
  description: 'The event format in which an agent run leaves its progress.',
  lang: 'en',
  base,
  cleanUrls: true,
  // A link that leads nowhere fails the build.
  ignoreDeadLinks: false,
  markdown: { config: (md) => md.use(linkRewrite) },
  themeConfig: {
    nav: [
      { text: 'Specification', link: '/SPEC' },
      { text: 'Getting started', link: '/docs/getting-started' },
      { text: 'Profiles', link: '/docs/profiles' },
      { text: 'Bindings', link: '/bindings/jsonl-file' },
    ],
    sidebar: [
      { text: 'Specification', link: '/SPEC' },
      { text: 'Getting started', link: '/docs/getting-started' },
      { text: 'Writing a binding', link: '/docs/bindings' },
      { text: 'Subject kinds', link: '/docs/subject-kinds' },
      { text: 'Writing a profile', link: '/docs/profiles' },
      { text: 'Binding: jsonl-file', link: '/bindings/jsonl-file' },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/GravionLabs/agent-events' }],
  },
})
