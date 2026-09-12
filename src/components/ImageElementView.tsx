import type { Point, Size } from '../editor/coordinates'
import { useElementDrag } from '../editor/useElementDrag'
import type { ImageElement } from '../model/presentation'
import { AssetImage } from './AssetImage'

interface ImageElementViewProps {
  element: ImageElement
  canvasSize: { width: number; height: number }
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

export function ImageElementView({
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
}: ImageElementViewProps) {
  const { position, size, pointerHandlers, resizeHandleProps } = useElementDrag({
    position: { x: element.x, y: element.y },
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
    lockAspectRatio: true,
  })

  return (
    <div
      className={`slide-element image-element${selected ? ' is-selected' : ''}${positionLocked ? ' is-position-locked' : ''}`}
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
        <AssetImage
          assetId={element.assetId}
          alt={element.alt}
          fit={element.fit}
          position={element.position}
        />
      </div>
      {showResizeHandle && (
        <button
          className="resize-handle"
          type="button"
          aria-label="調整圖片大小"
          {...resizeHandleProps}
        />
      )}
    </div>
  )
}
