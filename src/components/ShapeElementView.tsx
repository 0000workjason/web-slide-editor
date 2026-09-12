import type { Point, Size } from '../editor/coordinates'
import { useElementDrag } from '../editor/useElementDrag'
import type { ShapeElement } from '../model/presentation'
import { ShapeGraphic } from './ShapeGraphic'

interface ShapeElementViewProps {
  element: ShapeElement
  canvasSize: Size
  scale: number
  selected: boolean
  showResizeHandle: boolean
  positionLocked?: boolean
  previewOffset?: Point
  onSelect: (additive: boolean) => void
  transformMoveDelta?: (delta: Point) => Point
  onMovePreview?: (delta: Point) => void
  onMoveCommit: (point: Point, delta: Point) => void
  onMoveCancel?: () => void
  onResizeCommit: (size: Size) => void
}

export function ShapeElementView({
  element,
  canvasSize,
  scale,
  selected,
  showResizeHandle,
  positionLocked = false,
  previewOffset = { x: 0, y: 0 },
  onSelect,
  transformMoveDelta,
  onMovePreview,
  onMoveCommit,
  onMoveCancel,
  onResizeCommit,
}: ShapeElementViewProps) {
  const { position, size, pointerHandlers, resizeHandleProps } = useElementDrag({
    position: element,
    size: element,
    canvasSize,
    scale,
    disabled: positionLocked,
    onSelect,
    transformMoveDelta,
    onMovePreview,
    onMoveCommit,
    onMoveCancel,
    onResizeCommit,
  })

  return (
    <div
      className={`slide-element shape-element${selected ? ' is-selected' : ''}${positionLocked ? ' is-position-locked' : ''}`}
      data-element-id={element.id}
      style={{
        left: position.x + previewOffset.x,
        top: position.y + previewOffset.y,
        width: size.width,
        height: size.height,
      }}
      {...pointerHandlers}
    >
      <div className="element-visual" style={{ opacity: element.opacity ?? 1 }}>
        <ShapeGraphic element={element} />
      </div>
      {showResizeHandle && (
        <button
          className="resize-handle"
          type="button"
          aria-label="調整圖形大小"
          {...resizeHandleProps}
        />
      )}
    </div>
  )
}
