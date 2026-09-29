import { defineConfig } from 'astro/config'
import react from '@astrojs/react'

const isGitHubPages = process.env.GITHUB_PAGES === 'true'

export default defineConfig({
  site: isGitHubPages ? 'https://dothecoolwip1.github.io' : 'https://northborn.link',
  base: isGitHubPages ? '/NorthBorn/marketing' : '/',
  output: 'static',
  integrations: [react()],
  build: {
    format: 'directory',
  },
})
