import { useEffect, useState } from 'react'
import { nowMinutesIn, todayIn, type ISODate } from '@/core/dates'

const TICK_MS = 30_000

/** Today and the current wall-clock minute in `tz`, refreshed every 30 s (so the current-time
 *  line moves and the day rolls over at midnight within half a minute). */
export function useClock(tz: string): { today: ISODate; nowMinutes: number } {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), TICK_MS)
    return () => clearInterval(id)
  }, [])
  return { today: todayIn(tz), nowMinutes: nowMinutesIn(tz) }
}
