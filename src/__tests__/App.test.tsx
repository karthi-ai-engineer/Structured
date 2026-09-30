import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { AppRoutes } from '@/App'
import { createQueryClient } from '@/data/queries/client'

function render(path: string): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// Server rendering shows the first paint: data is still loading, so lists show skeletons.
describe('App routes', () => {
  it('renders the timeline with navigation, the week strip and the add button', () => {
    const html = render('/day/2026-10-01')
    expect(html).toContain('October 2026')
    expect(html).toContain('aria-label="Previous week"')
    expect(html).toContain('aria-current="date"')
    expect(html).toContain('aria-label="New task"')
    expect(html).toMatch(/href="\/inbox"/)
    expect(html).toMatch(/href="\/settings"/)
    expect(html).toContain('aria-busy="true"')
  })

  it('renders the inbox page', () => {
    const html = render('/inbox')
    expect(html).toContain('<h1 class="text-2xl font-semibold tracking-tight">Inbox</h1>')
    expect(html).toContain('aria-label="Add to inbox"')
  })

  it('renders the settings page with the database status', () => {
    const html = render('/settings')
    expect(html).toContain('Time zone')
    expect(html).toContain('role="radiogroup"')
    expect(html).toContain('data-state="checking"')
  })

  it('falls back to today for an invalid date in the URL', () => {
    const html = render('/day/not-a-date')
    expect(html).toContain('Today, ')
    expect(html).toContain('aria-current="date"')
    expect(html).not.toContain('not-a-date')
  })
})
