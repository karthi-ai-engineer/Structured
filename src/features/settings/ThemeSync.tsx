import { useEffect } from 'react'
import { useSettingsQuery } from '@/data/queries/settings'
import { applyTheme, cacheTheme, onSystemThemeChange, readCachedTheme } from '@/platform/theme'

/** Keeps the page theme in line with the synced setting and the system preference. Until the
 *  settings row loads, the theme cached on this device stays in place (no flash). */
export function ThemeSync() {
  const { data } = useSettingsQuery()
  const theme = data?.theme ?? readCachedTheme()
  useEffect(() => {
    applyTheme(theme)
    cacheTheme(theme)
    if (theme !== 'system') return
    return onSystemThemeChange(() => applyTheme('system'))
  }, [theme])
  return null
}
