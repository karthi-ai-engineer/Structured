import { Button } from '@/components/ui/button'

export function App() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-semibold tracking-tight">Structured</h1>
      {/* Placeholder until WP6 wires the database check to this button. */}
      <Button size="lg" variant="outline" className="min-h-11" disabled>
        Check again
      </Button>
    </main>
  )
}
