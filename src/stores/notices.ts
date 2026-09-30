// A tiny store for short, dismissable messages ("Could not save..."). Framework-free, read by
// the <Notices /> component through useSyncExternalStore.

export interface Notice {
  id: number
  message: string
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

export function notify(message: string): void {
  const id = nextId++
  notices = [...notices.slice(-2), { id, message }]
  emit()
  setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getNotices(): readonly Notice[] {
  return notices
}
