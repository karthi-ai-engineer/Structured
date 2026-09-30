// Settings query with an optimistic update. `useAppSettings` always returns usable settings:
// until the row loads (or if the database is not configured) it falls back to the defaults and
// the device's time zone.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DEFAULT_SETTINGS, type Settings, type SettingsPatch } from '@/core/settings'
import { settingsKey, settingsMutationKey } from '@/data/queries/keys'
import { settings } from '@/data/queries/repos'
import { detectTimeZone } from '@/platform/timezone'
import { notify } from '@/stores/notices'

export function useSettingsQuery() {
  return useQuery({ queryKey: settingsKey, queryFn: () => settings().get(), staleTime: 60_000 })
}

export function fallbackSettings(): Settings {
  return { ...DEFAULT_SETTINGS, timezone: detectTimeZone(), updatedAt: '' }
}

export function useAppSettings(): Settings {
  const { data } = useSettingsQuery()
  return data ?? fallbackSettings()
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationKey: settingsMutationKey,
    mutationFn: (patch: SettingsPatch) => settings().update(patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: settingsKey })
      const previous = qc.getQueryData<Settings | null>(settingsKey)
      if (previous) qc.setQueryData<Settings>(settingsKey, { ...previous, ...patch })
      return previous
    },
    onError: (_error, patch, previous) => {
      // Restore only the fields this write changed, so a newer pending write survives.
      if (previous) {
        const restored = Object.fromEntries(
          Object.keys(patch).map((k) => [k, previous[k as keyof Settings]]),
        ) as Partial<Settings>
        qc.setQueryData<Settings>(settingsKey, (current) =>
          current ? { ...current, ...restored } : previous,
        )
      }
      notify('Could not save the setting. It was undone.')
    },
    // Refetch once the last pending settings write settles (no mid-edit overwrites).
    onSettled: async () => {
      if (qc.isMutating({ mutationKey: settingsMutationKey }) <= 1) {
        await qc.invalidateQueries({ queryKey: settingsKey })
      }
    },
  })
  return (patch: SettingsPatch) => mutation.mutate(patch)
}
