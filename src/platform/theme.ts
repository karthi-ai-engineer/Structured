// Theme adapter: the system color-scheme preference, the `dark` class on <html>, and a local
// copy of the chosen theme so the first paint of the next visit already has the right colors.
import { isTheme, type Theme } from '@/core/settings'

const STORAGE_KEY = 'structured.theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(DARK_QUERY).matches
}

/** Calls `onChange` when the system preference flips; returns the unsubscribe function. */
export function onSystemThemeChange(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const media = window.matchMedia(DARK_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  const dark = theme === 'dark' || (theme === 'system' && systemPrefersDark())
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

export function readCachedTheme(): Theme {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return isTheme(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

export function cacheTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Private mode or blocked storage: the theme still applies for this visit.
  }
}
