import { useEffect, useState } from 'react'
import { QueryClientProvider, useIsMutating, useQueryClient } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { Notices } from '@/components/Notices'
import { startDbCheck } from '@/data/dbCheck'
import { createQueryClient } from '@/data/queries/client'
import { settingsKey } from '@/data/queries/keys'
import { isDbConfigured } from '@/data/queries/repos'
import { useRealtimeSync } from '@/data/queries/realtime'
import { useSeedDefaults } from '@/data/queries/seed'
import { MonthView } from '@/features/calendar/MonthView'
import { ReplanView } from '@/features/calendar/ReplanView'
import { WeekView } from '@/features/calendar/WeekView'
import { useAlertScheduler } from '@/features/alerts/useAlertScheduler'
import { EditorProvider } from '@/features/editor/EditorProvider'
import { FocusView } from '@/features/focus/FocusView'
import { InboxView } from '@/features/inbox/InboxView'
import { SettingsView } from '@/features/settings/SettingsView'
import { ThemeSync } from '@/features/settings/ThemeSync'
import { AppShell } from '@/features/shell/AppShell'
import { DayView } from '@/features/timeline/DayView'
import { isOnline } from '@/platform/network'
import { detectTimeZone } from '@/platform/timezone'
import { guardUnload } from '@/platform/unload'

/** Live sync, the unsaved-changes guard, and the first-load check that creates the settings row
 *  on a fresh database. */
function Background() {
  const qc = useQueryClient()
  const saving = useIsMutating() > 0
  useRealtimeSync()
  useSeedDefaults()
  useAlertScheduler()
  useEffect(() => guardUnload(saving), [saving])
  useEffect(() => {
    if (!isDbConfigured) return
    void startDbCheck({ timezone: detectTimeZone(), online: isOnline() }).then(() =>
      qc.invalidateQueries({ queryKey: settingsKey }),
    )
  }, [qc])
  return null
}

/** The routes, without a router, so tests can wrap them in a MemoryRouter. */
export function AppRoutes() {
  return (
    <EditorProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DayView />} />
          <Route path="day/:date" element={<DayView />} />
          <Route path="week" element={<WeekView />} />
          <Route path="week/:date" element={<WeekView />} />
          <Route path="month" element={<MonthView />} />
          <Route path="month/:month" element={<MonthView />} />
          <Route path="replan" element={<ReplanView />} />
          <Route path="focus/:id" element={<FocusView />} />
          <Route path="inbox" element={<InboxView />} />
          <Route path="settings" element={<SettingsView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </EditorProvider>
  )
}

export function App() {
  const [queryClient] = useState(createQueryClient)
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeSync />
      <Background />
      {isDbConfigured ? null : (
        <p role="alert" className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
          Database not configured: add .env.local (see README).
        </p>
      )}
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
      <Notices />
    </QueryClientProvider>
  )
}
