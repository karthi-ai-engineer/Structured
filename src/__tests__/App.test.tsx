import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { App } from '@/App'

// Server rendering shows the Suspense fallback while the check is pending, which pins the first
// paint: the app name, the "checking" badge and an enabled, touch-sized "Check again" button.
describe('App', () => {
  it('renders the name, the checking badge and the Check again button', () => {
    const markup = renderToStaticMarkup(<App />)

    expect(markup).toContain('<h1 class="text-3xl font-semibold tracking-tight">Structured</h1>')
    expect(markup).toContain('data-state="checking"')
    expect(markup).toMatch(/<button[^>]*class="[^"]*min-h-11[^"]*"[^>]*>Check again<\/button>/)
    expect(markup).toContain('aria-busy="false"')
    // No disabled attribute (the Tailwind class list itself contains "disabled:" variants).
    expect(markup).not.toMatch(/<button[^>]*\sdisabled=""/)
  })
})
