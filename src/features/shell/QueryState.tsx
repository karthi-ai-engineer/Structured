import type { ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { DataError } from '@/data/repo/tasks'

function errorText(error: unknown): string {
  if (error instanceof DataError) {
    if (error.code === 'not-configured') return 'The database is not configured on this build.'
    if (error.code === 'offline' || error.code === 'network') return 'You seem to be offline.'
    if (error.code === 'paused') return 'The database is paused. Restore it in Supabase.'
    return `Could not load (${error.code}).`
  }
  return 'Could not load.'
}

/**
 * Loading and error states around a query. Once data has loaded it stays on screen: a failed
 * background refetch (focus, reconnect, after a save) only adds a small note instead of
 * replacing the day with an error.
 */
export function QueryState({
  query,
  children,
}: {
  query: UseQueryResult<unknown>
  children: ReactNode
}) {
  if (query.data === undefined) {
    if (query.isError) {
      return (
        <div role="alert" className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-muted-foreground">{errorText(query.error)}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      )
    }
    return (
      <div aria-busy="true" className="flex flex-col gap-3 py-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    )
  }
  return (
    <>
      {query.isRefetchError ? (
        <p role="status" className="text-xs text-muted-foreground">
          Could not refresh ({errorText(query.error).replace(/\.$/, '')}). Showing saved data.
        </p>
      ) : null}
      {children}
    </>
  )
}
