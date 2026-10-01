// The screens that load on demand, in one place: `lazy()` uses these loaders, and
// `preloadScreens` fetches them all once the page has settled, so the service worker caches
// every chunk while online (an installed app opened offline then never misses one).
import { lazy } from 'react'

const loaders = {
  week: () => import('@/features/calendar/WeekView'),
  month: () => import('@/features/calendar/MonthView'),
  replan: () => import('@/features/calendar/ReplanView'),
  focus: () => import('@/features/focus/FocusView'),
  search: () => import('@/features/search/SearchView'),
  editor: () => import('@/features/editor/TaskEditor'),
}

export const WeekView = lazy(() => loaders.week().then((m) => ({ default: m.WeekView })))
export const MonthView = lazy(() => loaders.month().then((m) => ({ default: m.MonthView })))
export const ReplanView = lazy(() => loaders.replan().then((m) => ({ default: m.ReplanView })))
export const FocusView = lazy(() => loaders.focus().then((m) => ({ default: m.FocusView })))
export const SearchView = lazy(() => loaders.search().then((m) => ({ default: m.SearchView })))
/** A fresh lazy editor: `lazy()` remembers a failed load, so after a failure the provider makes
 *  a new one and the next opening tries again. */
export function createLazyEditor() {
  return lazy(() => loaders.editor().then((m) => ({ default: m.TaskEditor })))
}

/** Fetches every on-demand screen a few seconds after start (failures are ignored: the screen
 *  simply loads when opened). */
export function preloadScreens(delayMs = 3000): () => void {
  const timer = setTimeout(() => {
    for (const load of Object.values(loaders)) void load().catch(() => undefined)
  }, delayMs)
  return () => clearTimeout(timer)
}
