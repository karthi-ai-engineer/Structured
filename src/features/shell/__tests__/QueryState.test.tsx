import { renderToStaticMarkup } from 'react-dom/server'
import type { UseQueryResult } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { DataError } from '@/data/repo/tasks'
import { QueryState } from '@/features/shell/QueryState'

function render(query: Partial<UseQueryResult<unknown>>): string {
  return renderToStaticMarkup(
    <QueryState query={query as UseQueryResult<unknown>}>
      <p>loaded content</p>
    </QueryState>,
  )
}

describe('QueryState', () => {
  it('shows a skeleton while nothing has loaded', () => {
    expect(render({ data: undefined, isError: false })).toContain('aria-busy="true"')
  })

  it('shows an error with a retry when the first load fails', () => {
    const html = render({ data: undefined, isError: true, error: new DataError('offline') })
    expect(html).toContain('role="alert"')
    expect(html).toContain('You seem to be offline.')
  })

  it('keeps loaded data on screen when a background refetch fails', () => {
    const html = render({
      data: [],
      isError: true,
      isRefetchError: true,
      error: new DataError('network'),
    })
    expect(html).toContain('loaded content')
    expect(html).toContain('Showing saved data.')
    expect(html).not.toContain('role="alert"')
  })
})
