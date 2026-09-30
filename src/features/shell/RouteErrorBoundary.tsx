import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}
interface State {
  failed: boolean
}

/**
 * Catches a crash inside one screen, so the navigation (and Settings) stays usable. The shell
 * remounts it on every route change (`key={pathname}`), which clears the error.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  override render() {
    if (!this.state.failed) return this.props.children
    return (
      <div
        role="alert"
        className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-16 text-center"
      >
        <h1 className="text-xl font-semibold">This screen hit a problem</h1>
        <p className="text-sm text-muted-foreground">
          The rest of the app still works. Check Settings, or try this screen again.
        </p>
        <Button variant="outline" onClick={() => this.setState({ failed: false })}>
          Try again
        </Button>
      </div>
    )
  }
}
