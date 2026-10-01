// Installable app adapter (PLAN.md S7, S9): registers the service worker in production builds
// and keeps the browser's install prompt for a Settings button.

interface InstallPrompt extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let installPrompt: InstallPrompt | null = null
const listeners = new Set<() => void>()

/** Registers /sw.js (production only: the dev server's modules must never be cached). */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined') return
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installPrompt = e as InstallPrompt
    for (const listener of listeners) listener()
  })
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}

/** Whether the browser offers to install the app right now. */
export function canInstall(): boolean {
  return installPrompt !== null
}

export function onInstallChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Shows the browser's install dialog; true when the app was installed. */
export async function install(): Promise<boolean> {
  const prompt = installPrompt
  if (!prompt) return false
  installPrompt = null
  await prompt.prompt()
  const { outcome } = await prompt.userChoice
  for (const listener of listeners) listener()
  return outcome === 'accepted'
}
