import { useState, type FormEvent } from 'react'
import { Check, Inbox, Plus, Repeat, Trash2, X } from 'lucide-react'
import { formatDuration, nowMinutesIn, todayIn } from '@/core/dates'
import {
  DEFAULT_TASK_COLOR,
  DURATION_PRESETS,
  TASK_COLORS,
  colorHex,
  firstEmoji,
  nextStartTime,
  normalizeTitle,
  validateDraft,
  type Subtask,
  type TaskDraft,
} from '@/core/tasks'
import { changesOf, planDelete, planEdit, scopesFor, type EditScope } from '@/core/seriesEdits'
import { DEFAULT_ICON, TASK_ICONS, TaskIcon } from '@/components/TaskIcon'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useAppSettings } from '@/data/queries/settings'
import { useTaskActions } from '@/data/queries/tasks'
import type { EditorRequest } from '@/features/editor/editorContext'
import { RepeatField } from '@/features/editor/RepeatField'
import {
  initialRepeat,
  repeatProblems,
  repeatSpecOf,
  type RepeatState,
} from '@/features/editor/repeatState'
import { cn } from '@/lib/utils'

function initialDraft(request: EditorRequest, defaultDuration: number): TaskDraft {
  if (request.mode === 'edit') {
    const { title, notes, icon, color, subtasks, date, startTime, durationMin, isAllDay } =
      request.task
    return { title, notes, icon, color, subtasks, date, startTime, durationMin, isAllDay }
  }
  return {
    title: '',
    notes: null,
    icon: null,
    color: DEFAULT_TASK_COLOR,
    subtasks: [],
    date: null,
    startTime: null,
    durationMin: defaultDuration,
    isAllDay: false,
    ...request.defaults,
  }
}

const SCOPE_LABELS: Record<EditScope, string> = {
  this: 'This task only',
  future: 'This and future tasks',
  all: 'All tasks',
}

export function TaskEditor({ request, onClose }: { request: EditorRequest; onClose: () => void }) {
  const settings = useAppSettings()
  const actions = useTaskActions()
  const [draft, setDraft] = useState<TaskDraft>(() =>
    initialDraft(request, settings.defaultDuration),
  )
  const [showIcons, setShowIcons] = useState(false)
  const [newSubtask, setNewSubtask] = useState('')
  // The custom duration field keeps its raw text, so it can be emptied while typing; an empty or
  // partial value becomes NaN, which validateDraft rejects (never a silent 0).
  const [durationText, setDurationText] = useState(() => String(draft.durationMin))
  // The date the task had (or was opened for), restored when "Scheduled" is switched back on.
  const originalDate = request.mode === 'edit' ? request.task.date : (request.defaults.date ?? null)
  const set = (patch: Partial<TaskDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const today = todayIn(settings.timezone)
  const editing = request.mode === 'edit' ? request.task : null
  const occurrence = editing?.recurrence ? editing : null
  const [repeat, setRepeat] = useState<RepeatState>(() =>
    initialRepeat(editing, draft.date ?? today),
  )
  // Saving or deleting an occurrence first asks which occurrences the change is for.
  const [asking, setAsking] = useState<{ action: 'save' | 'delete'; scopes: EditScope[] } | null>(
    null,
  )

  const start = draft.date ?? today
  const repeatSpec = draft.date === null ? null : repeatSpecOf(repeat, start)
  const repeating = repeatSpec !== null
  const problems = [...validateDraft(draft), ...repeatProblems(repeat, start)]
  const isEdit = request.mode === 'edit'
  const scheduled = draft.date !== null
  const accent = colorHex(draft.color)

  function cleanDraft(): TaskDraft {
    return {
      ...draft,
      title: normalizeTitle(draft.title),
      notes: draft.notes?.trim() ? draft.notes.trim() : null,
      startTime: draft.date === null || draft.isAllDay ? null : draft.startTime,
      isAllDay: draft.date !== null && draft.isAllDay,
    }
  }

  function save(event?: FormEvent) {
    event?.preventDefault()
    if (problems.length > 0) return
    const clean = cleanDraft()
    if (occurrence) {
      const changes = changesOf(occurrence, clean, repeatSpec)
      const unchanged =
        JSON.stringify(clean) === JSON.stringify(initialDraft(request, settings.defaultDuration)) &&
        !changes.rule &&
        !changes.until
      if (unchanged) onClose()
      else setAsking({ action: 'save', scopes: [] })
      return
    }
    // A completed task moved to the inbox is reopened: the inbox lists only open tasks, so it
    // would otherwise disappear from every screen.
    const reopen = editing !== null && clean.date === null && editing.completedAt !== null
    if (editing) {
      actions.update(editing, reopen ? { ...clean, completedAt: null } : clean, repeatSpec)
    } else actions.create(crypto.randomUUID(), clean, repeatSpec)
    onClose()
  }

  // The fields stay editable while the choice is shown, so the offered scopes follow them.
  const shownScopes =
    asking?.action === 'save' && occurrence
      ? scopesFor(occurrence, cleanDraft(), repeatSpec)
      : (asking?.scopes ?? [])

  function choose(scope: EditScope) {
    if (!occurrence || !asking) return
    try {
      actions.applySeries(
        asking.action === 'delete'
          ? planDelete(occurrence, scope)
          : planEdit(occurrence, cleanDraft(), repeatSpec, scope, crypto.randomUUID()),
      )
    } catch {
      // The form changed after the choice was shown; the buttons now show what is possible.
      return
    }
    onClose()
  }

  function addSubtask() {
    const title = normalizeTitle(newSubtask)
    if (!title) return
    const item: Subtask = { id: crypto.randomUUID(), title, done: false }
    set({ subtasks: [...draft.subtasks, item] })
    setNewSubtask('')
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent
        className={cn(
          'max-h-[92svh] gap-5 overflow-y-auto sm:max-w-lg',
          // Phones: a bottom sheet.
          'max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none',
          'max-sm:duration-200 max-sm:data-open:zoom-in-100 max-sm:data-open:slide-in-from-bottom max-sm:data-closed:zoom-out-100 max-sm:data-closed:slide-out-to-bottom',
        )}
      >
        <DialogTitle>{isEdit ? 'Edit task' : 'New task'}</DialogTitle>
        <DialogDescription className="sr-only">
          Title, time, duration, color, icon, subtasks and notes of the task.
        </DialogDescription>

        <form onSubmit={save} className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Choose icon"
              aria-expanded={showIcons}
              onClick={() => setShowIcons((v) => !v)}
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: accent }}
            >
              <TaskIcon icon={draft.icon} />
            </button>
            <Input
              autoFocus
              aria-label="Title"
              placeholder="What do you want to do?"
              value={draft.title}
              maxLength={200}
              onChange={(e) => set({ title: e.target.value })}
              className="h-11 text-base"
            />
          </div>

          {showIcons ? (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-8 gap-1">
                {Object.keys(TASK_ICONS).map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-label={`Icon ${name}`}
                    aria-pressed={(draft.icon ?? DEFAULT_ICON) === name}
                    onClick={() => {
                      set({ icon: name })
                      setShowIcons(false)
                    }}
                    className={cn(
                      'flex aspect-square items-center justify-center rounded-md hover:bg-muted',
                      (draft.icon ?? DEFAULT_ICON) === name && 'bg-muted ring-2 ring-ring',
                    )}
                  >
                    <TaskIcon icon={name} className="size-4" />
                  </button>
                ))}
              </div>
              <Input
                aria-label="Or type an emoji"
                placeholder="Or type an emoji"
                defaultValue={draft.icon !== null && !TASK_ICONS[draft.icon] ? draft.icon : ''}
                onChange={(e) => {
                  const emoji = firstEmoji(e.target.value)
                  if (emoji) set({ icon: emoji })
                }}
              />
            </div>
          ) : null}

          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Color</legend>
            {TASK_COLORS.map((c) => (
              <button
                key={c.name}
                type="button"
                aria-label={`Color ${c.name}`}
                aria-pressed={draft.color === c.name}
                onClick={() => set({ color: c.name })}
                className="flex size-8 items-center justify-center rounded-full"
                style={{ backgroundColor: c.hex }}
              >
                {draft.color === c.name ? <Check className="size-4 text-white" /> : null}
              </button>
            ))}
          </fieldset>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="task-scheduled">Scheduled</Label>
              <Switch
                id="task-scheduled"
                checked={scheduled}
                disabled={repeating}
                onCheckedChange={(on) =>
                  set(
                    on
                      ? {
                          date: originalDate ?? todayIn(settings.timezone),
                          startTime:
                            draft.startTime ?? nextStartTime(nowMinutesIn(settings.timezone)),
                        }
                      : { date: null, startTime: null, isAllDay: false },
                  )
                }
              />
            </div>
            {scheduled ? null : (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Inbox className="size-4" /> Saved to the inbox, to schedule later.
              </p>
            )}
            {repeating ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Repeat className="size-3" /> A repeating task stays scheduled. Set Repeat to Never
                to move it to the inbox.
              </p>
            ) : null}
            {scheduled ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="task-date">Date</Label>
                    <Input
                      id="task-date"
                      type="date"
                      value={draft.date ?? ''}
                      // Clearing a date segment reports '' mid-edit: keep the last full date.
                      onChange={(e) => {
                        if (e.target.value) set({ date: e.target.value })
                      }}
                    />
                  </div>
                  {draft.isAllDay ? null : (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="task-time">Start</Label>
                      <Input
                        id="task-time"
                        type="time"
                        value={draft.startTime ?? ''}
                        onChange={(e) => set({ startTime: e.target.value || null })}
                      />
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="task-all-day">All day</Label>
                  <Switch
                    id="task-all-day"
                    checked={draft.isAllDay}
                    onCheckedChange={(on) => set({ isAllDay: on })}
                  />
                </div>
                <RepeatField
                  state={repeat}
                  start={start}
                  weekStart={settings.weekStart}
                  onChange={setRepeat}
                />
              </>
            ) : null}
          </div>

          {draft.isAllDay ? null : (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Duration</legend>
              <div className="flex flex-wrap gap-2">
                {DURATION_PRESETS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={draft.durationMin === m}
                    onClick={() => {
                      set({ durationMin: m })
                      setDurationText(String(m))
                    }}
                    className={cn(
                      'min-h-9 rounded-full border px-3 text-sm',
                      draft.durationMin === m ? 'border-transparent text-white' : 'hover:bg-muted',
                    )}
                    style={draft.durationMin === m ? { backgroundColor: accent } : undefined}
                  >
                    {formatDuration(m)}
                  </button>
                ))}
                <Input
                  type="number"
                  aria-label="Custom duration in minutes"
                  min={0}
                  max={1440}
                  value={durationText}
                  onChange={(e) => {
                    const text = e.target.value
                    setDurationText(text)
                    set({ durationMin: text.trim() === '' ? Number.NaN : Math.round(Number(text)) })
                  }}
                  className="h-9 w-24"
                />
              </div>
            </fieldset>
          )}

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Subtasks</legend>
            {draft.subtasks.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={`Done: ${s.title}`}
                  checked={s.done}
                  onChange={() =>
                    set({
                      subtasks: draft.subtasks.map((x) =>
                        x.id === s.id ? { ...x, done: !x.done } : x,
                      ),
                    })
                  }
                  className="size-4 accent-current"
                />
                <span className={cn('flex-1', s.done && 'text-muted-foreground line-through')}>
                  {s.title}
                </span>
                <button
                  type="button"
                  aria-label={`Remove subtask ${s.title}`}
                  onClick={() => set({ subtasks: draft.subtasks.filter((x) => x.id !== s.id) })}
                  className="rounded p-1 text-muted-foreground hover:bg-muted"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                aria-label="New subtask"
                placeholder="Add a subtask"
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addSubtask()
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Add subtask"
                onClick={addSubtask}
              >
                <Plus />
              </Button>
            </div>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-notes">Notes</Label>
            <Textarea
              id="task-notes"
              rows={3}
              value={draft.notes ?? ''}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </div>

          {problems.length > 0 && draft.title.trim() !== '' ? (
            <ul className="text-sm text-destructive">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}

          {asking ? (
            <div
              role="group"
              aria-label={
                asking.action === 'save' ? 'Save the repeating task' : 'Delete the repeating task'
              }
              className="flex flex-col gap-2 rounded-lg border p-3"
            >
              <p className="text-sm font-medium">
                {asking.action === 'save' ? 'Save the change for' : 'Delete'}
              </p>
              {asking.action === 'save' && shownScopes.length === 0 ? (
                <p className="text-sm text-destructive">
                  Save a new day and a new end date one at a time: first one, then the other.
                </p>
              ) : null}
              {asking.action === 'save' && shownScopes.length === 1 && shownScopes[0] === 'this' ? (
                <p className="text-xs text-muted-foreground">
                  In a weekly series a new day applies to this task only. To move every future task,
                  change Repeat to the new weekday.
                </p>
              ) : null}
              {shownScopes.map((scope) => (
                <Button
                  key={scope}
                  type="button"
                  variant={asking.action === 'delete' ? 'destructive' : 'outline'}
                  className="min-h-11 justify-start"
                  onClick={() => choose(scope)}
                >
                  {SCOPE_LABELS[scope]}
                </Button>
              ))}
              <Button type="button" variant="ghost" onClick={() => setAsking(null)}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {editing ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => {
                    if (occurrence) {
                      setAsking({ action: 'delete', scopes: ['this', 'future', 'all'] })
                      return
                    }
                    actions.remove(editing)
                    onClose()
                  }}
                >
                  <Trash2 data-icon="inline-start" /> Delete
                </Button>
              ) : null}
              <Button
                type="submit"
                className="ml-auto min-h-11 px-6"
                disabled={problems.length > 0}
              >
                {isEdit ? 'Save' : 'Add task'}
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
