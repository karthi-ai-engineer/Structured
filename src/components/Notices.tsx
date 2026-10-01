import { useSyncExternalStore } from 'react'
import { X } from 'lucide-react'
import { dismiss, getNotices, subscribe } from '@/stores/notices'

/** Short messages (errors, and undo offers), bottom center, above the mobile tab bar. The live
 *  region is always mounted, so screen readers announce the first message too. */
export function Notices() {
  const notices = useSyncExternalStore(subscribe, getNotices, getNotices)
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6"
    >
      {notices.map((n) => (
        <div
          key={n.id}
          className="pointer-events-auto flex max-w-sm items-center gap-3 rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg"
        >
          <span>{n.message}</span>
          {n.action ? (
            <button
              type="button"
              className="rounded px-2 py-1 font-semibold underline-offset-2 hover:bg-background/20"
              onClick={() => {
                n.action?.run()
                dismiss(n.id)
              }}
            >
              {n.action.label}
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Dismiss"
            className="rounded p-1 hover:bg-background/20"
            onClick={() => dismiss(n.id)}
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
