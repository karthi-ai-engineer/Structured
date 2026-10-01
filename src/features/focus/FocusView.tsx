import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Pause, Play, SkipForward, X } from 'lucide-react'
import { nowIso, nowMs, toMinutes } from '@/core/dates'
import {
  formatCountdown,
  planIntervals,
  positionAt,
  startOfSegment,
  type Segment,
} from '@/core/focus'
import { colorHex, taskEnd, type Task } from '@/core/tasks'
import { TaskIcon } from '@/components/TaskIcon'
import { Button, buttonVariants } from '@/components/ui/button'
import { taskKeys } from '@/data/queries/keys'
import { focus } from '@/data/queries/repos'
import { useAppSettings } from '@/data/queries/settings'
import { useTaskActions } from '@/data/queries/tasks'
import { useClock } from '@/features/timeline/useClock'
import { cn } from '@/lib/utils'

const RING = 2 * Math.PI * 120

/** A task from any cached list (focus opens from the timeline, so it is loaded). */
function useCachedTask(id: string): Task | null {
  const qc = useQueryClient()
  for (const [, data] of qc.getQueriesData<Task[]>({ queryKey: taskKeys.all })) {
    const found = data?.find((t) => t.id === id)
    if (found) return found
  }
  return null
}

/** Minutes to focus: until the task ends when it is running now, else its duration. */
function focusMinutes(task: Task, today: string, nowMinutes: number, fallback: number): number {
  const end = taskEnd(task)
  if (task.date === today && task.startTime && end && end.dayOffset === 0) {
    const start = toMinutes(task.startTime)
    const stop = toMinutes(end.time)
    if (nowMinutes >= start && nowMinutes < stop) return stop - nowMinutes
  }
  return task.durationMin > 0 ? task.durationMin : fallback
}

/** Full-screen focus timer for one task (PLAN.md F1, F2). */
export function FocusView() {
  const { id = '' } = useParams()
  const task = useCachedTask(id)
  const settings = useAppSettings()
  const { today, nowMinutes } = useClock(settings.timezone)
  const navigate = useNavigate()
  const actions = useTaskActions()

  // The plan is fixed when the timer starts.
  const [segments] = useState<Segment[]>(() =>
    task
      ? planIntervals(
          focusMinutes(task, today, nowMinutes, settings.focusMinutes),
          settings.focusMinutes,
          settings.breakMinutes,
        )
      : [],
  )
  const [clock, setClock] = useState(() => ({
    startedAt: nowMs(),
    pausedAt: null as number | null,
  }))
  const [, setTick] = useState(0)
  const logged = useRef(0)
  const segmentStart = useRef(nowIso())

  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 250)
    return () => clearInterval(timer)
  }, [])

  const elapsed = (clock.pausedAt ?? nowMs()) - clock.startedAt
  const position = positionAt(segments, elapsed)
  const segment = segments[position.index]
  const paused = clock.pausedAt !== null

  // Log every segment that has ended (once), for the stats.
  useEffect(() => {
    while (logged.current < position.index) {
      const done = segments[logged.current]
      logged.current += 1
      if (!done) continue
      const endedAt = nowIso()
      void focus()
        .log({
          taskId: task?.id ?? null,
          kind: done.kind,
          startedAt: segmentStart.current,
          endedAt,
          plannedMin: done.minutes,
        })
        .catch(() => undefined)
      segmentStart.current = endedAt
    }
  }, [position.index, segments, task?.id])

  function togglePause() {
    setClock((c) =>
      c.pausedAt === null
        ? { ...c, pausedAt: nowMs() }
        : { startedAt: c.startedAt + (nowMs() - c.pausedAt), pausedAt: null },
    )
  }

  function skip() {
    // Move the start back so the next segment begins now.
    const target = startOfSegment(segments, position.index + 1)
    setClock((c) => ({ ...c, startedAt: (c.pausedAt ?? nowMs()) - target }))
  }

  function exit(markDone: boolean) {
    if (markDone && task && task.completedAt === null) actions.toggleComplete(task)
    void navigate(-1)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === ' ') {
        e.preventDefault()
        togglePause()
      } else if (e.key === 'Escape') {
        exit(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!task) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center text-muted-foreground">
        <p>This task is not loaded. Open it from the timeline, then start focus.</p>
        <Link to="/" className={buttonVariants({ variant: 'outline' })}>
          Back to today
        </Link>
      </div>
    )
  }

  const hex = colorHex(task.color)
  const isBreak = segment?.kind === 'break'
  const focusCount = segments.filter((s) => s.kind === 'focus').length
  const focusIndex = segments.slice(0, position.index + 1).filter((s) => s.kind === 'focus').length

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Focus: ${task.title}`}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-background px-6"
    >
      <button
        type="button"
        aria-label="Leave focus"
        onClick={() => exit(false)}
        className="absolute top-4 right-4 rounded-full p-2 text-muted-foreground hover:bg-muted"
      >
        <X className="size-5" />
      </button>

      <div className="flex items-center gap-3">
        <span
          className="flex size-10 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: hex }}
        >
          <TaskIcon icon={task.icon} className="size-5" />
        </span>
        <h1 className="text-xl font-semibold">{task.title}</h1>
      </div>

      <div className="relative size-72">
        <svg viewBox="0 0 260 260" className="size-full -rotate-90" aria-hidden="true">
          <circle cx="130" cy="130" r="120" className="fill-none stroke-muted" strokeWidth="10" />
          <circle
            cx="130"
            cy="130"
            r="120"
            className="fill-none transition-[stroke-dashoffset] duration-300"
            stroke={isBreak ? '#1DD1A1' : hex}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - position.segmentProgress)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <span className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
            {position.done ? 'Done' : isBreak ? 'Break' : 'Focus'}
          </span>
          <span
            role="timer"
            aria-live="off"
            className={cn('text-6xl font-semibold tabular-nums', paused && 'opacity-50')}
          >
            {formatCountdown(position.remainingMs)}
          </span>
          {position.done ? null : (
            <span className="text-sm text-muted-foreground">
              Interval {Math.max(focusIndex, 1)} of {focusCount}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {position.done ? null : (
          <>
            <Button size="lg" variant="outline" onClick={togglePause}>
              {paused ? <Play data-icon="inline-start" /> : <Pause data-icon="inline-start" />}
              {paused ? 'Resume' : 'Pause'}
            </Button>
            <Button size="lg" variant="ghost" onClick={skip}>
              <SkipForward data-icon="inline-start" /> {isBreak ? 'Skip break' : 'Skip'}
            </Button>
          </>
        )}
        <Button size="lg" onClick={() => exit(true)}>
          <Check data-icon="inline-start" /> {task.completedAt ? 'Close' : 'Mark done'}
        </Button>
      </div>
    </div>
  )
}
