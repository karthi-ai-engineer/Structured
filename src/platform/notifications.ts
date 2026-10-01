// Browser notifications adapter (PLAN.md N2). Desktop notifications work while the app (tab or
// installed app) is open; without permission the app shows its own in-page notices instead.

export type NotificationState = 'granted' | 'denied' | 'default' | 'unsupported'

function api(): typeof Notification | null {
  return typeof window !== 'undefined' && 'Notification' in window ? window.Notification : null
}

export function notificationState(): NotificationState {
  return api()?.permission ?? 'unsupported'
}

/** Asks for permission (the browser shows its prompt only once). */
export async function requestNotifications(): Promise<NotificationState> {
  const n = api()
  if (!n) return 'unsupported'
  return n.permission === 'default' ? await n.requestPermission() : n.permission
}

/** Shows a system notification; `tag` makes repeats (another open tab) replace each other.
 *  False when it could not be shown. */
export function showNotification(title: string, body: string, tag: string): boolean {
  const n = api()
  if (n?.permission !== 'granted') return false
  try {
    new n(title, { body, tag })
    return true
  } catch {
    // Some mobile browsers allow notifications only through a service worker.
    return false
  }
}

/** Whether the page is in front of the user (in-page notices are useless otherwise). */
export function isPageVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible'
}
