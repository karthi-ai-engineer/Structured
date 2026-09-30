import { useState, type ReactNode } from 'react'
import { TaskEditor } from '@/features/editor/TaskEditor'
import { EditorContext, type EditorApi, type EditorRequest } from '@/features/editor/editorContext'

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
        <TaskEditor key={openCount} request={request} onClose={() => setRequest(null)} />
      ) : null}
    </EditorContext>
  )
}
