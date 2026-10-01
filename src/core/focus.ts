/**
 * Focus mode with intervals (PLAN.md F1, F2): the time to focus is split into focus and break
 * segments (default 25/5), fitted to the time the task has left.
 */

export interface Segment {
  kind: 'focus' | 'break'
  minutes: number
}

/**
 * Focus and break segments filling `totalMinutes`. The last segment is always focus time; a
 * leftover too short for a break plus some focus is added to the last focus segment.
 */
export function planIntervals(
  totalMinutes: number,
  focusMinutes: number,
  breakMinutes: number,
): Segment[] {
  const total = Math.max(1, Math.round(totalMinutes))
  const focus = Math.max(1, Math.round(focusMinutes))
  const rest = Math.max(0, Math.round(breakMinutes))
  const segments: Segment[] = []
  let left = total
  while (left > 0) {
    if (left <= focus || rest === 0 || left - focus <= rest) {
      segments.push({ kind: 'focus', minutes: left })
      break
    }
    segments.push({ kind: 'focus', minutes: focus })
    segments.push({ kind: 'break', minutes: rest })
    left -= focus + rest
  }
  return segments
}

export interface FocusPosition {
  /** The current segment, or segments.length when everything is done. */
  index: number
  /** Milliseconds left in the current segment. */
  remainingMs: number
  /** 0..1 through the current segment. */
  segmentProgress: number
  /** 0..1 through all segments. */
  overallProgress: number
  done: boolean
}

/** Where a timer that has run for `elapsedMs` stands. */
export function positionAt(segments: readonly Segment[], elapsedMs: number): FocusPosition {
  const totalMs = segments.reduce((sum, s) => sum + s.minutes * 60_000, 0)
  const elapsed = Math.min(Math.max(elapsedMs, 0), totalMs)
  let start = 0
  for (let i = 0; i < segments.length; i++) {
    const length = (segments[i]?.minutes ?? 0) * 60_000
    if (elapsed < start + length) {
      return {
        index: i,
        remainingMs: start + length - elapsed,
        segmentProgress: (elapsed - start) / length,
        overallProgress: totalMs === 0 ? 1 : elapsed / totalMs,
        done: false,
      }
    }
    start += length
  }
  return {
    index: segments.length,
    remainingMs: 0,
    segmentProgress: 1,
    overallProgress: 1,
    done: true,
  }
}

/** The elapsed time at the start of segment `index` (to skip ahead). */
export function startOfSegment(segments: readonly Segment[], index: number): number {
  return segments.slice(0, index).reduce((sum, s) => sum + s.minutes * 60_000, 0)
}

/** 'mm:ss', or 'h:mm:ss' from an hour up. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
