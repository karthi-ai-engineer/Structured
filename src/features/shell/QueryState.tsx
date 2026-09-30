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

/** Loading and error states around a query; children render once data is there. */
export function QueryState({
  query,
  children,
}: {
  query: UseQueryResult<unknown>
  children: ReactNode
}) {
  if (query.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3 py-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    )
  }
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
  return <>{children}</>
}
