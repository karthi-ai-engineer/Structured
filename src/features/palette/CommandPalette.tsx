import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import {
  CalendarDays,
  CalendarRange,
  Command,
  History,
  Inbox,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  Timer,
  type LucideIcon,
} from 'lucide-react'
import { monthOf } from '@/core/calendar'
import { nowMinutesIn, todayIn } from '@/core/dates'
import { nextStartTime, taskProgress, type Task } from '@/core/tasks'
import { TaskIcon } from '@/components/TaskIcon'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useAppSettings, useUpdateSettings } from '@/data/queries/settings'
import { useCachedTasks } from '@/data/queries/tasks'
import { useEditor } from '@/features/editor/editorContext'
import { cn } from '@/lib/utils'

interface Item {
  id: string
  label: string
  hint?: string
  icon: LucideIcon | null
  task?: Task
  run: () => void
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

/**
 * The command palette (PLAN.md S6): Ctrl+K or ⌘K anywhere. Jump to a screen, add a task, focus
 * on the running task, switch the theme, or open a task by name. `/` jumps to search.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [active, setActive] = useState(0)
  const navigate = useNavigate()
  const editor = useEditor()
  const settings = useAppSettings()
  const updateSettings = useUpdateSettings()
  const cached = useCachedTasks()

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        // Not over another dialog (the editor): a command would replace it and lose its edits.
        const palette = document.getElementById('palette-list')
        if (!palette && document.querySelector('[role="dialog"]')) return
        e.preventDefault()
        setText('')
        setActive(0)
        setOpen((o) => !o)
        return
      }
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e.target)) {
        if (document.querySelector('[role="dialog"]')) return
        e.preventDefault()
        void navigate('/search')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  const items = useMemo((): Item[] => {
    const today = todayIn(settings.timezone)
    const now = nowMinutesIn(settings.timezone)
    const go = (to: string) => () => void navigate(to)
    const running = cached.find(
      (t) =>
        t.completedAt === null &&
        taskProgress(t, today, now) > 0 &&
        taskProgress(t, today, now) < 1,
    )
    const commands: Item[] = [
      { id: 'today', label: 'Go to today', hint: 'T', icon: CalendarDays, run: go('/') },
      { id: 'week', label: 'Go to this week', icon: CalendarRange, run: go(`/week/${today}`) },
      {
        id: 'month',
        label: 'Go to this month',
        icon: CalendarRange,
        run: go(`/month/${monthOf(today)}`),
      },
      { id: 'inbox', label: 'Go to the inbox', icon: Inbox, run: go('/inbox') },
      { id: 'search', label: 'Search tasks', hint: '/', icon: Search, run: go('/search') },
      { id: 'replan', label: 'Replan unfinished tasks', icon: History, run: go('/replan') },
      { id: 'settings', label: 'Settings', icon: Settings, run: go('/settings') },
      {
        id: 'new',
        label: 'New task',
        hint: 'N',
        icon: Plus,
        run: () => editor.openCreate({ date: today, startTime: nextStartTime(now) }),
      },
      ...(running
        ? [
            {
              id: 'focus',
              label: `Focus on ${running.title}`,
              icon: Timer,
              run: go(`/focus/${encodeURIComponent(running.id)}`),
            },
          ]
        : []),
      {
        id: 'theme',
        label: settings.theme === 'dark' ? 'Use the light theme' : 'Use the dark theme',
        icon: settings.theme === 'dark' ? Sun : Moon,
        run: () => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' }),
      },
    ]
    const q = text.trim().toLowerCase()
    if (q === '') return commands
    const matching = commands.filter((c) => c.label.toLowerCase().includes(q))
    const tasks =
      q.length < 2
        ? []
        : cached
            .filter((t) => t.title.toLowerCase().includes(q))
            .slice(0, 8)
            .map((t): Item => ({
              id: `task-${t.id}`,
              label: t.title,
              hint: t.date ?? 'Inbox',
              icon: null,
              task: t,
              run: () => editor.openEdit(t),
            }))
    return [...matching, ...tasks]
  }, [text, cached, settings.timezone, settings.theme, navigate, editor, updateSettings])

  // The highlight always points at an item (the list changes as tasks load or the text changes).
  const current = Math.min(Math.max(active, 0), Math.max(items.length - 1, 0))

  function choose(item: Item | undefined) {
    if (!item) return
    setOpen(false)
    item.run()
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') setActive(Math.min(current + 1, Math.max(items.length - 1, 0)))
    else if (e.key === 'ArrowUp') setActive(Math.max(current - 1, 0))
    else if (e.key === 'Enter') choose(items[current])
    else return
    e.preventDefault()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg" showCloseButton={false}>
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Type to filter commands and tasks; Enter runs the highlighted one.
        </DialogDescription>
        <div className="flex items-center gap-2 border-b px-3">
          <Command className="size-4 text-muted-foreground" />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[current] ? `palette-${items[current].id}` : undefined}
            aria-label="Command"
            placeholder="Type a command or a task…"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            className="h-12 flex-1 bg-transparent text-base outline-none"
          />
        </div>
        <ul
          id="palette-list"
          role="listbox"
          aria-label="Commands"
          className="max-h-80 overflow-y-auto p-1"
        >
          {items.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nothing matches.
            </li>
          ) : (
            items.map((item, i) => {
              const Icon = item.icon
              return (
                <li
                  key={item.id}
                  id={`palette-${item.id}`}
                  role="option"
                  aria-selected={i === current}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(item)}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm',
                    i === current && 'bg-muted',
                  )}
                >
                  {Icon ? (
                    <Icon className="size-4 text-muted-foreground" />
                  ) : (
                    <TaskIcon
                      icon={item.task?.icon ?? null}
                      className="size-4 text-muted-foreground"
                    />
                  )}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.hint ? (
                    <kbd className="rounded border px-1.5 text-xs text-muted-foreground">
                      {item.hint}
                    </kbd>
                  ) : null}
                </li>
              )
            })
          )}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
