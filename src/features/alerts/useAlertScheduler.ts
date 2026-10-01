// Fires today's task alerts (PLAN.md N1, N2) while the app is open: a desktop notification when
// allowed, otherwise an in-page notice. Each alert fires once per page load and tab (the
// notification tag also stops other tabs from showing it twice).
import { useEffect, useRef } from 'react'
import { alertText, alertsForDay, dueBetween } from '@/core/alerts'
import { formatTime } from '@/core/dates'
import { useAppSettings } from '@/data/queries/settings'
import { useDayTasks } from '@/data/queries/tasks'
import { useClock } from '@/features/timeline/useClock'
import { isPageVisible, showNotification } from '@/platform/notifications'
import { notify } from '@/stores/notices'

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
    // From the minute after the last check (or this minute, on the first check of a day).
    const from = last?.today === today ? last.minute : nowMinutes - 1
    checked.current = { today, minute: nowMinutes }
    if (nowMinutes <= from) return
    const due = dueBetween(alertsForDay(tasks, settings.defaultAlerts), from, nowMinutes)
    for (const alert of due) {
      if (fired.current.has(alert.key)) continue
      fired.current.add(alert.key)
      const text = alertText(alert, (m) => formatTime(m, settings.timeFormat))
      if (!showNotification('Structured', text, alert.key) && isPageVisible()) notify(text)
    }
  }, [day.data, today, nowMinutes, settings.defaultAlerts, settings.timeFormat])
}
