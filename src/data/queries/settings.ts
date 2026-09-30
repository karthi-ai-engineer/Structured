// Settings query with an optimistic update. `useAppSettings` always returns usable settings:
// until the row loads (or if the database is not configured) it falls back to the defaults and
// the device's time zone.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DEFAULT_SETTINGS, type Settings, type SettingsPatch } from '@/core/settings'
import { settingsKey } from '@/data/queries/keys'
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
    mutationFn: (patch: SettingsPatch) => settings().update(patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: settingsKey })
      const previous = qc.getQueryData<Settings | null>(settingsKey)
      if (previous) qc.setQueryData<Settings>(settingsKey, { ...previous, ...patch })
      return previous
    },
    onError: (_error, _patch, previous) => {
      qc.setQueryData(settingsKey, previous)
      notify('Could not save the setting. It was undone.')
    },
    onSettled: () => qc.invalidateQueries({ queryKey: settingsKey }),
  })
  return (patch: SettingsPatch) => mutation.mutate(patch)
}
