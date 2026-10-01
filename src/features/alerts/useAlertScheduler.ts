// Fires today's task alerts (PLAN.md N1, N2) while the app is open: a desktop notification when
// allowed, otherwise an in-page notice. Each alert fires once per page load and tab (the
// notification tag also stops other tabs from showing it twice). After a sleep or a hidden tab
// only the last few minutes are caught up, so old alerts never arrive in a burst.

import { useEffect, useRef } from 'react'
import { alertText, alertsForDay, dueBetween } from '@/core/alerts'
import { formatTime } from '@/core/dates'
import { useAppSettings } from '@/data/queries/settings'
import { useDayTasks } from '@/data/queries/tasks'
import { useClock } from '@/features/timeline/useClock'
import { isPageVisible, showNotification } from '@/platform/notifications'
import { notify } from '@/stores/notices'

/** How far back a check looks after a gap (sleep, a throttled tab). */
const CATCH_UP_MINUTES = 5

export function useAlertScheduler(): void {
  const settings = useAppSettings()
  const { today, nowMinutes } = useClock(settings.timezone)
  const day = useDayTasks(today)
  const checked = useRef<{ today: string; minute: number } | null>(null)
  const fired = useRef(new Set<string>())

  useEffect(() => {
    const tasks = day.data
    if (!tasks) return
    const last = checked.current
    // From the last check; on a new day from midnight (its tasks may load a little late); on the
    // first check, this minute only. Never more than a few minutes back.
    const from = last === null ? nowMinutes - 1 : last.today === today ? last.minute : -1
    const since = Math.max(from, nowMinutes - CATCH_UP_MINUTES)
    checked.current = { today, minute: nowMinutes }
    if (nowMinutes <= since) return
    const due = dueBetween(alertsForDay(tasks, settings.defaultAlerts), since, nowMinutes)
    for (const alert of due) {
      if (fired.current.has(alert.key)) continue
      fired.current.add(alert.key)
      const text = alertText(alert, (m) => formatTime(m, settings.timeFormat))
      if (!showNotification('Structured', text, alert.key) && isPageVisible()) notify(text)
    }
  }, [day.data, today, nowMinutes, settings.defaultAlerts, settings.timeFormat])
}
