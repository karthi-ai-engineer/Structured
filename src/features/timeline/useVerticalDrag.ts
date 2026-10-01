import { useCallback, useEffect, useRef, useState, type PointerEvent, type MouseEvent } from 'react'

/** Vertical pixels per minute of drag: a two-hour move is a 120 px drag. */
export const PX_PER_MINUTE = 1

const MOUSE_THRESHOLD_PX = 4
/** Touch drags start with a long press, so a normal swipe still scrolls the page. */
const LONG_PRESS_MS = 350
const TOUCH_SLOP_PX = 8

interface DragState {
  pointerId: number
  startY: number
  active: boolean
  timer: ReturnType<typeof setTimeout> | null
}

/**
 * A vertical drag on one element, in minutes. Mouse and pen drags start after a few pixels;
 * touch drags after a long press (scrolling is blocked only once the drag has started). The
 * click that ends a drag is swallowed, so dragging never also opens the task.
 */
export function useVerticalDrag(onDone: (minutes: number) => void) {
  const [minutes, setMinutes] = useState<number | null>(null)
  const state = useRef<DragState | null>(null)
  const swallowClick = useRef(false)
  const element = useRef<HTMLElement | null>(null)

  const reset = useCallback(() => {
    if (state.current?.timer) clearTimeout(state.current.timer)
    state.current = null
    setMinutes(null)
  }, [])

  // Once a touch drag runs, the page must not scroll: that needs a non-passive listener.
  useEffect(() => {
    const node = element.current
    if (!node) return
    const block = (e: TouchEvent) => {
      if (state.current?.active) e.preventDefault()
    }
    node.addEventListener('touchmove', block, { passive: false })
    return () => node.removeEventListener('touchmove', block)
  })
  useEffect(() => reset, [reset])

  function activate(target: Element) {
    const s = state.current
    if (!s) return
    s.active = true
    setMinutes(0)
    try {
      target.setPointerCapture(s.pointerId)
    } catch {
      // The pointer is already gone; pointerup or pointercancel ends the drag.
    }
  }

  return {
    /** Minutes dragged so far (unsnapped), or null when no drag is running. */
    minutes,
    bind: {
      ref: (node: HTMLElement | null) => {
        element.current = node
      },
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        reset()
        const target = e.currentTarget
        state.current = { pointerId: e.pointerId, startY: e.clientY, active: false, timer: null }
        if (e.pointerType === 'touch') {
          state.current.timer = setTimeout(() => activate(target), LONG_PRESS_MS)
        } else {
          // Capture at once: a quick move would otherwise leave a small target (the resize
          // handle) before the drag starts. Touch pointers are captured implicitly.
          try {
            target.setPointerCapture(e.pointerId)
          } catch {
            // Synthetic or already-released pointer: the drag still works while over the target.
          }
        }
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        const s = state.current
        if (!s || s.pointerId !== e.pointerId) return
        const dy = e.clientY - s.startY
        if (!s.active) {
          if (e.pointerType === 'touch') {
            if (Math.abs(dy) > TOUCH_SLOP_PX) reset() // a scroll, not a long press
          } else if (Math.abs(dy) > MOUSE_THRESHOLD_PX) {
            activate(e.currentTarget)
          }
          return
        }
        setMinutes(dy / PX_PER_MINUTE)
      },
      onPointerUp: (e: PointerEvent<HTMLElement>) => {
        const s = state.current
        if (!s || s.pointerId !== e.pointerId) return
        if (s.active) {
          swallowClick.current = true
          onDone((e.clientY - s.startY) / PX_PER_MINUTE)
        }
        reset()
      },
      onPointerCancel: reset,
      onClickCapture: (e: MouseEvent<HTMLElement>) => {
        if (!swallowClick.current) return
        swallowClick.current = false
        e.preventDefault()
        e.stopPropagation()
      },
      // A long press would otherwise open the context menu or start a text selection.
      onContextMenu: (e: MouseEvent<HTMLElement>) => {
        if (state.current) e.preventDefault()
      },
    },
  }
}
