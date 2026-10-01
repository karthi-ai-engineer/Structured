// The default "Rise and Shine" and "Wind Down" series (PLAN.md T18), created once per database.
// The `seed_default_tasks` function sets `settings.seeded_at` in the same statement, so only one
// device ever creates them, and deleting them later does not bring them back.
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { todayIn } from '@/core/dates'
import { taskKeys } from '@/data/queries/keys'
import { isDbConfigured, tasks } from '@/data/queries/repos'
import { useSettingsQuery } from '@/data/queries/settings'

let attempted = false

export function useSeedDefaults(): void {
  const qc = useQueryClient()
  const { data: settings } = useSettingsQuery()

  useEffect(() => {
    if (!isDbConfigured || !settings || attempted) return
    attempted = true
    tasks()
      .seedDefaults(todayIn(settings.timezone), settings.dayStart, settings.dayEnd)
      .then(
        (created) => {
          if (created) void qc.invalidateQueries({ queryKey: taskKeys.all })
        },
        // Try again on the next load; the marker makes a retry safe.
        () => undefined,
      )
  }, [settings, qc])
}
