import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RootErrorBoundary } from '@/components/RootErrorBoundary'

describe('RootErrorBoundary', () => {
  it('renders its children while nothing failed', () => {
    const markup = renderToStaticMarkup(
      <RootErrorBoundary>
        <p>child content</p>
      </RootErrorBoundary>,
    )
    expect(markup).toBe('<p>child content</p>')
  })

  it('switches to the fallback after an error', () => {
    expect(RootErrorBoundary.getDerivedStateFromError()).toEqual({ failed: true })
  })

  it('shows a message and a large Reload button instead of a white screen', () => {
    const boundary = new RootErrorBoundary({ children: <p>child content</p> })
    boundary.state = RootErrorBoundary.getDerivedStateFromError()
    const markup = renderToStaticMarkup(<>{boundary.render()}</>)

    expect(markup).toContain('role="alert"')
    expect(markup).toContain('Something went wrong')
    expect(markup).toMatch(/<button[^>]*class="[^"]*min-h-11[^"]*"[^>]*>Reload<\/button>/)
    expect(markup).not.toContain('child content')
  })
})
