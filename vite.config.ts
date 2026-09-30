import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { readSupabaseEnv } from './src/data/env.ts'

const SHA = /^[0-9a-f]{7,40}$/

// <meta name="build-sha"> lets the deploy smoke check prove which commit is live (public SHA only).
function buildShaMeta(): Plugin {
  const raw = process.env.VITE_BUILD_SHA ?? ''
  const sha = SHA.test(raw) ? raw : 'dev'
  return {
    name: 'structured:build-sha',
    transformIndexHtml: (html) =>
      html.replace('</head>', `  <meta name="build-sha" content="${sha}" />\n  </head>`),
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Production builds must never ship without a valid browser Supabase config (placeholders,
  // empty values and secret keys are rejected). CI's verify build is intentionally unconfigured.
  // The message names variables only, never values (build logs are public).
  if (process.env.REQUIRE_SUPABASE_ENV === '1' || process.env.VERCEL_ENV === 'production') {
    const env = readSupabaseEnv(loadEnv(mode, process.cwd(), 'VITE_'), {
      requirePublishable: true,
    })
    if (!env.ok) {
      throw new Error(`Production build refused; invalid Supabase env: ${env.problems.join('; ')}`)
    }
  }
  return {
    plugins: [react(), tailwindcss(), buildShaMeta()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    // An orphaned server must make the next start fail instead of silently moving to another port.
    server: { strictPort: true },
    preview: { strictPort: true },
  }
})
