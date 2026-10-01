// A tiny store for short, dismissable messages ("Could not save..."). Framework-free, read by
// the <Notices /> component through useSyncExternalStore.

export interface NoticeAction {
  label: string
  run: () => void
}

export interface Notice {
  id: number
  message: string
  /** An optional button, such as Undo (PLAN.md T19). */
  action?: NoticeAction
}

type Listener = () => void

let notices: readonly Notice[] = []
let nextId = 1
const listeners = new Set<Listener>()
const AUTO_DISMISS_MS = 5_000

function emit() {
  for (const listener of listeners) listener()
}

export function dismiss(id: number): void {
  notices = notices.filter((n) => n.id !== id)
  emit()
}

export function notify(message: string, action?: NoticeAction): void {
  const id = nextId++
  notices = [...notices.slice(-2), action ? { id, message, action } : { id, message }]
  emit()
  // Notices with an action stay a little longer, so there is time to use it.
  setTimeout(() => dismiss(id), action ? AUTO_DISMISS_MS * 1.5 : AUTO_DISMISS_MS)
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getNotices(): readonly Notice[] {
  return notices
}
