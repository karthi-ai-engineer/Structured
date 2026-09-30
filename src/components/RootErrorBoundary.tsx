import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface RootErrorBoundaryProps {
  children: ReactNode
}

interface RootErrorBoundaryState {
  failed: boolean
}

/**
 * Last line of defence: a render error shows a short message and a reload button instead of a
 * white screen. React itself logs the error to the console; nothing about it is rendered.
 */
export class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  override state: RootErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): RootErrorBoundaryState {
    return { failed: true }
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <main
        role="alert"
        className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 p-6 text-center"
      >
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">Reload the page to try again.</p>
        <Button size="lg" className="min-h-11" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </main>
    )
  }
}
