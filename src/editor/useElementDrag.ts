import { useRef, useState, type PointerEventHandler } from 'react'
import {
  clampElementPosition,
  resizeElement,
  screenDeltaToCanvas,
  type Point,
  type Size,
} from './coordinates'

interface UseElementDragOptions {
  position: Point
  size: { width: number; height: number }
  canvasSize: { width: number; height: number }
  scale: number
  disabled?: boolean
  onSelect: (additive: boolean) => void
  transformMoveDelta?: (delta: Point) => Point
  onMovePreview?: (delta: Point) => void
  onMoveCommit: (point: Point, delta: Point) => void
  onMoveCancel?: () => void
  onResizeCommit: (size: Size) => void
  lockAspectRatio?: boolean
}

interface DragState {
  pointerId: number
  screenStart: Point
  elementStart: Point
}

interface ResizeState {
  pointerId: number
  screenStart: Point
  sizeStart: Size
}

export function useElementDrag({
  position,
  size,
  canvasSize,
  scale,
  disabled = false,
  onSelect,
  transformMoveDelta,
  onMovePreview,
  onMoveCommit,
  onMoveCancel,
  onResizeCommit,
  lockAspectRatio = false,
}: UseElementDragOptions) {
  const dragRef = useRef<DragState | null>(null)
  const resizeRef = useRef<ResizeState | null>(null)
  const transientPositionRef = useRef<Point | null>(null)
  const transientSizeRef = useRef<Size | null>(null)
  const [transientPosition, setTransientPosition] = useState<Point | null>(null)
  const [transientSize, setTransientSize] = useState<Size | null>(null)

  const onPointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
    if (event.button !== 0) return
    event.stopPropagation()
    onSelect(event.ctrlKey || event.metaKey || event.shiftKey)
    if (disabled) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      screenStart: { x: event.clientX, y: event.clientY },
      elementStart: position,
    }
  }

  const onPointerMove: PointerEventHandler<HTMLDivElement> = (event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const rawDelta = screenDeltaToCanvas(
      event.clientX - drag.screenStart.x,
      event.clientY - drag.screenStart.y,
      scale,
    )
    const transformedDelta = transformMoveDelta?.(rawDelta)
    const nextPosition = transformedDelta
      ? {
          x: drag.elementStart.x + transformedDelta.x,
          y: drag.elementStart.y + transformedDelta.y,
        }
      : clampElementPosition(
          {
            x: Math.round(drag.elementStart.x + rawDelta.x),
            y: Math.round(drag.elementStart.y + rawDelta.y),
          },
          size,
          canvasSize,
        )
    transientPositionRef.current = nextPosition
    setTransientPosition(nextPosition)
    onMovePreview?.({
      x: nextPosition.x - drag.elementStart.x,
      y: nextPosition.y - drag.elementStart.y,
    })
  }

  const onPointerUp: PointerEventHandler<HTMLDivElement> = (event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const delta = transientPositionRef.current
      ? {
          x: transientPositionRef.current.x - drag.elementStart.x,
          y: transientPositionRef.current.y - drag.elementStart.y,
        }
      : { x: 0, y: 0 }
    dragRef.current = null
    if (transientPositionRef.current) {
      onMoveCommit(transientPositionRef.current, delta)
    }
    transientPositionRef.current = null
    setTransientPosition(null)
    onMoveCancel?.()
  }

  const onPointerCancel: PointerEventHandler<HTMLDivElement> = (event) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    transientPositionRef.current = null
    setTransientPosition(null)
  }

  const onResizePointerDown: PointerEventHandler<HTMLButtonElement> = (event) => {
    if (disabled || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    onSelect(event.ctrlKey || event.metaKey || event.shiftKey)
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeRef.current = {
      pointerId: event.pointerId,
      screenStart: { x: event.clientX, y: event.clientY },
      sizeStart: size,
    }
  }

  const onResizePointerMove: PointerEventHandler<HTMLButtonElement> = (event) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    const delta = screenDeltaToCanvas(
      event.clientX - resize.screenStart.x,
      event.clientY - resize.screenStart.y,
      scale,
    )
    const nextSize = resizeElement(
      position,
      resize.sizeStart,
      delta,
      canvasSize,
      lockAspectRatio,
    )
    transientSizeRef.current = nextSize
    setTransientSize(nextSize)
  }

  const onResizePointerUp: PointerEventHandler<HTMLButtonElement> = (event) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    resizeRef.current = null
    if (transientSizeRef.current) onResizeCommit(transientSizeRef.current)
    transientSizeRef.current = null
    setTransientSize(null)
  }

  const onResizePointerCancel: PointerEventHandler<HTMLButtonElement> = (event) => {
    if (resizeRef.current?.pointerId !== event.pointerId) return
    resizeRef.current = null
    transientSizeRef.current = null
    setTransientSize(null)
  }

  return {
    position: transientPosition ?? position,
    size: transientSize ?? size,
    pointerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
    resizeHandleProps: {
      onPointerDown: onResizePointerDown,
      onPointerMove: onResizePointerMove,
      onPointerUp: onResizePointerUp,
      onPointerCancel: onResizePointerCancel,
    },
  }
}
