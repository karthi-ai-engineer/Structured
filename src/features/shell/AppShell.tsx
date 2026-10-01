import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import {
  CalendarDays,
  Inbox,
  Search,
  Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react'
import { InboxList } from '@/features/inbox/InboxList'
import { CommandPalette } from '@/features/palette/CommandPalette'
import { RouteErrorBoundary } from '@/features/shell/RouteErrorBoundary'
import { cn } from '@/lib/utils'

const NAV: readonly { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Timeline', icon: CalendarDays },
  { to: '/inbox', label: 'Inbox', icon: Inbox },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

/** The planning screens: the Timeline tab, with the inbox panel beside them on desktop. */
function isTimeline(pathname: string): boolean {
  return (
    pathname === '/' ||
    ['/day/', '/week', '/month', '/replan'].some((prefix) => pathname.startsWith(prefix))
  )
}

/** Phones: content plus a bottom tab bar. Desktop: sidebar, content and an inbox panel. */
export function AppShell() {
  const { pathname } = useLocation()
  const active = (to: string) => (to === '/' ? isTimeline(pathname) : pathname.startsWith(to))

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[13rem_minmax(0,1fr)_22rem]">
      <aside className="hidden border-r lg:flex lg:flex-col lg:gap-6 lg:p-4">
        <div className="flex items-center gap-2 px-2 pt-2">
          <span className="size-3 rounded-full bg-[#FF6B6B]" aria-hidden="true" />
          <span className="font-semibold tracking-tight">Structured</span>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm',
                active(to) ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60',
              )}
            >
              <Icon className="size-4" /> {label}
            </NavLink>
          ))}
        </nav>
        <p className="mt-auto px-3 text-xs text-muted-foreground">
          <kbd className="rounded border px-1">Ctrl</kbd>{' '}
          <kbd className="rounded border px-1">K</kbd> for commands
        </p>
      </aside>

      <main className="min-w-0">
        <RouteErrorBoundary key={pathname}>
          <Suspense fallback={<RouteLoading />}>
            <Outlet />
          </Suspense>
        </RouteErrorBoundary>
      </main>

      <aside
        aria-label="Inbox panel"
        className={cn('hidden border-l p-4 lg:block', !isTimeline(pathname) && 'lg:invisible')}
      >
        {isTimeline(pathname) ? (
          <div className="sticky top-4 flex flex-col gap-3">
            <h2 className="text-sm font-semibold">Inbox</h2>
            <InboxList />
          </div>
        ) : null}
      </aside>

      <CommandPalette />

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={cn(
              'flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs',
              active(to) ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            <Icon className="size-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

/** Shown for a moment while a screen's code loads. */
function RouteLoading() {
  return (
    <div aria-busy="true" className="flex justify-center py-24 text-sm text-muted-foreground">
      Loading…
    </div>
  )
}
