import { Suspense, use, useState, useTransition } from 'react'
import { LoaderCircle } from 'lucide-react'
import { DbStatusBadge } from '@/components/DbStatusBadge'
import { Button } from '@/components/ui/button'
import { startDbCheck } from '@/data/dbCheck'
import type { DbStatus } from '@/data/health'
import { isOnline } from '@/platform/network'
import { detectTimeZone } from '@/platform/timezone'

function runDbCheck(): Promise<DbStatus> {
  return startDbCheck({ timezone: detectTimeZone(), online: isOnline() })
}

function DbStatusView({ promise }: { promise: Promise<DbStatus> }) {
  return <DbStatusBadge status={use(promise)} />
}

export function App() {
  // The promise lives in App's state (App never suspends, so the state survives). The first
  // check starts in the initializer; StrictMode's second call joins it (singleflight).
  const [status, setStatus] = useState(runDbCheck)
  // "Check again" runs as a transition: the current badge stays until the new result arrives.
  const [isPending, startTransition] = useTransition()

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-semibold tracking-tight">Structured</h1>
      <Suspense fallback={<DbStatusBadge status={{ state: 'checking' }} />}>
        <DbStatusView promise={status} />
      </Suspense>
      <Button
        size="lg"
        variant="outline"
        className="min-h-11"
        disabled={isPending}
        aria-busy={isPending}
        onClick={() => startTransition(() => setStatus(runDbCheck()))}
      >
        {isPending ? (
          <LoaderCircle data-icon="inline-start" className="motion-safe:animate-spin" />
        ) : null}
        Check again
      </Button>
    </main>
  )
}
