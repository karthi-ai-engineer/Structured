// Browser network adapter (docs/phases/phase-0/PLAN.md 6.5).

/** False only when the browser positively reports being offline. */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}
