// The task being dragged from the inbox to the timeline (desktop, HTML drag and drop). Drop
// targets cannot read the drag data during dragover, so the task waits here. The drag also
// carries a type of its own: a drop is accepted only with it, so a stale task (its inbox item
// unmounted mid-drag, and dragend never came) is never moved by an unrelated drag.
import { useState, type DragEvent } from 'react'
import type { Task } from '@/core/tasks'

let dragged: Task | null = null

/** The drag data type that marks a task drag from the inbox. */
export const TASK_DRAG_TYPE = 'application/x-structured-task'

const isTaskDrag = (e: DragEvent) => e.dataTransfer.types.includes(TASK_DRAG_TYPE)

export const taskDrag = {
  start(task: Task, transfer: DataTransfer): void {
    dragged = task
    transfer.setData(TASK_DRAG_TYPE, task.id)
    transfer.setData('text/plain', task.title)
    transfer.effectAllowed = 'move'
  },
  end(): void {
    dragged = null
  },
  current(): Task | null {
    return dragged
  },
}

/** Accepts an inbox task dropped here (desktop drag and drop). */
export function useTaskDrop(onDrop: (task: Task) => void) {
  const [over, setOver] = useState(false)
  return {
    over,
    bind: {
      onDragOver: (e: DragEvent) => {
        if (!dragged || !isTaskDrag(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOver(true)
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        const task = dragged
        setOver(false)
        if (!task || !isTaskDrag(e)) return
        e.preventDefault()
        dragged = null
        onDrop(task)
      },
    },
  }
}
