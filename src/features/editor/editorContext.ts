import { createContext, use } from 'react'
import type { Task, TaskDraft } from '@/core/tasks'

export type EditorRequest =
  { mode: 'create'; defaults: Partial<TaskDraft> } | { mode: 'edit'; task: Task }

export interface EditorApi {
  openCreate: (defaults: Partial<TaskDraft>) => void
  openEdit: (task: Task) => void
}

export const EditorContext = createContext<EditorApi | null>(null)

export function useEditor(): EditorApi {
  const api = use(EditorContext)
  if (!api) throw new Error('useEditor must be used inside <EditorProvider>')
  return api
}
