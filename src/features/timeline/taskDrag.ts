// The task being dragged from the inbox to the timeline (desktop, HTML drag and drop). Drop
// targets cannot read the drag data during dragover, so the task waits here.
import { useState, type DragEvent } from 'react'
import type { Task } from '@/core/tasks'

let dragged: Task | null = null

export const taskDrag = {
  start(task: Task): void {
    dragged = task
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
        if (!dragged) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOver(true)
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        const task = dragged
        setOver(false)
        if (!task) return
        e.preventDefault()
        dragged = null
        onDrop(task)
      },
    },
  }
}
