// Leave-page guard: while a change is still being saved, closing or reloading the tab asks for
// confirmation, so an optimistic edit is not lost before its request reaches the database.

function onBeforeUnload(event: BeforeUnloadEvent): void {
  event.preventDefault()
}

/** Turns the guard on or off; returns a function that turns it off. */
export function guardUnload(active: boolean): () => void {
  if (!active || typeof window === 'undefined') return () => {}
  window.addEventListener('beforeunload', onBeforeUnload)
  return () => window.removeEventListener('beforeunload', onBeforeUnload)
}
