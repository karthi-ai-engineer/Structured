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
import { useDayTasks, useTaskActions } from '@/data/queries/tasks'
import { useClock } from '@/features/timeline/useClock'
import { cn } from '@/lib/utils'

const RING = 2 * Math.PI * 120

/** A task from any cached list. The tick below re-renders, so a task that loads after a reload
 *  (today's list is fetched in the background) is picked up. */
function useCachedTask(id: string): Task | null {
  const qc = useQueryClient()
  for (const [, data] of qc.getQueriesData<Task[]>({ queryKey: taskKeys.all })) {
    const found = data?.find((t) => t.id === id)
    if (found) return found
  }
  return null
}

function useTick(ms: number): void {
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), ms)
    return () => clearInterval(timer)
  }, [ms])
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
  useTick(500)
  const task = useCachedTask(id)
  if (!task) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center text-muted-foreground">
        <p>Loading the task… If it does not appear, open it from the timeline and start focus.</p>
        <Link to="/" className={buttonVariants({ variant: 'outline' })}>
          Back to today
        </Link>
      </div>
    )
  }
  // Mounted once the task is known, so the interval plan starts from real values.
  return <FocusTimer key={task.id} task={task} />
}

function FocusTimer({ task }: { task: Task }) {
  const settings = useAppSettings()
  const { today, nowMinutes } = useClock(settings.timezone)
  const navigate = useNavigate()
  const actions = useTaskActions()
  const dialog = useRef<HTMLDivElement>(null)
  useTick(250)
  // Watching the task's day keeps that list cached for as long as the timer runs (an unwatched
  // list is dropped a few minutes after its view closes, and the task would vanish).
  useDayTasks(task.date ?? today)

  // The plan is fixed when the timer starts.
  const [segments] = useState<Segment[]>(() =>
    planIntervals(
      focusMinutes(task, today, nowMinutes, settings.focusMinutes),
      settings.focusMinutes,
      settings.breakMinutes,
    ),
  )
  const [clock, setClock] = useState(() => ({
    startedAt: nowMs(),
    pausedAt: null as number | null,
  }))
  const logged = useRef(0)

  const current = clock.pausedAt ?? nowMs()
  const position = positionAt(segments, current - clock.startedAt)
  const segment = segments[position.index]
  const paused = clock.pausedAt !== null

  /** Logs segment `index` from its start up to `endMs` (for the stats). */
  function log(index: number, endMs: number) {
    const s = segments[index]
    if (!s) return
    const startMs = clock.startedAt + startOfSegment(segments, index)
    if (endMs <= startMs) return
    void focus()
      .log({
        taskId: task.id,
        kind: s.kind,
        startedAt: nowIso(new Date(startMs)),
        endedAt: nowIso(new Date(endMs)),
        plannedMin: s.minutes,
      })
      .catch(() => undefined)
  }

  // Every segment that has ended is logged once, with its own start and end times.
  useEffect(() => {
    while (logged.current < position.index) {
      const index = logged.current
      logged.current += 1
      log(index, clock.startedAt + startOfSegment(segments, index + 1))
    }
  })

  useEffect(() => dialog.current?.focus(), [])

  function togglePause() {
    setClock((c) =>
      c.pausedAt === null
        ? { ...c, pausedAt: nowMs() }
        : { startedAt: c.startedAt + (nowMs() - c.pausedAt), pausedAt: null },
    )
  }

  function skip() {
    // Logs what was done of this segment, then moves the start so the next one begins now.
    log(position.index, current)
    logged.current = position.index + 1
    const target = startOfSegment(segments, position.index + 1)
    setClock((c) => ({ ...c, startedAt: (c.pausedAt ?? nowMs()) - target }))
  }

  function exit(markDone: boolean) {
    if (!position.done) {
      log(position.index, current)
      logged.current = segments.length
    }
    if (markDone && task.completedAt === null) actions.toggleComplete(task)
    void navigate(-1)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Space on a focused button presses that button; elsewhere it pauses.
      const onControl = e.target instanceof Element && e.target.closest('button, a, input')
      if (e.key === ' ' && !onControl) {
        e.preventDefault()
        togglePause()
      } else if (e.key === 'Escape') {
        exit(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const hex = colorHex(task.color)
  const isBreak = segment?.kind === 'break'
  const focusCount = segments.filter((s) => s.kind === 'focus').length
  const focusIndex = segments.slice(0, position.index + 1).filter((s) => s.kind === 'focus').length

  return (
    <div
      ref={dialog}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Focus: ${task.title}`}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-background px-6 outline-none"
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
