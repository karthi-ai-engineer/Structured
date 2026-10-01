import { Suspense, useState, type ReactNode } from 'react'
import { EditorBoundary } from '@/features/editor/EditorBoundary'
import { EditorContext, type EditorApi, type EditorRequest } from '@/features/editor/editorContext'
import { TaskEditor } from '@/features/shell/screens'
import { notify } from '@/stores/notices'

/** Hosts the single task editor dialog and lets any screen open it. */
export function EditorProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<EditorRequest | null>(null)
  // A new key per opening resets the form state inside the editor.
  const [openCount, setOpenCount] = useState(0)

  const api: EditorApi = {
    openCreate: (defaults) => {
      setOpenCount((n) => n + 1)
      setRequest({ mode: 'create', defaults })
    },
    openEdit: (task) => {
      setOpenCount((n) => n + 1)
      setRequest({ mode: 'edit', task })
    },
  }

  return (
    <EditorContext value={api}>
      {children}
      {request ? (
        // The editor's code loads the first time it opens; a failure closes it with a notice.
        <EditorBoundary
          key={openCount}
          onError={() => {
            setRequest(null)
            notify('Could not open the editor. Check the connection and try again.')
          }}
        >
          <Suspense fallback={null}>
            <TaskEditor request={request} onClose={() => setRequest(null)} />
          </Suspense>
        </EditorBoundary>
      ) : null}
    </EditorContext>
  )
}
