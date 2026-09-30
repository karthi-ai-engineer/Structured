// Live sync (PLAN.md section 12): any change to tasks or settings, from another device, another
// tab or Claude, invalidates the matching queries. Every (re)subscribe refreshes everything,
// because events missed while disconnected are not replayed.
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js'
import { settingsKey, taskKeys } from '@/data/queries/keys'
import { supabase } from '@/data/supabase'

export function useRealtimeSync(): void {
  const qc = useQueryClient()

  useEffect(() => {
    const db = supabase
    if (!db) return
    const channel = db
      .channel('app-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        void qc.invalidateQueries({ queryKey: taskKeys.all })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, () => {
        void qc.invalidateQueries({ queryKey: settingsKey })
      })
      .subscribe((status) => {
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) void qc.invalidateQueries()
      })
    return () => {
      void db.removeChannel(channel)
    }
  }, [qc])
}
