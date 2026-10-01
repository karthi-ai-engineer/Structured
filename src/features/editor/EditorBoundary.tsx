import { Component, type ReactNode } from 'react'

/**
 * Keeps a failure inside the editor (most often its code chunk failing to load: offline, or an
 * old tab after a deploy) from replacing the whole app: the editor closes and `onError` tells
 * the user instead.
 */
export class EditorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override componentDidCatch(): void {
    this.props.onError()
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}
