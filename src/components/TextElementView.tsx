import { useEffect, useRef } from 'react'
import type { Point, Size } from '../editor/coordinates'
import { useElementDrag } from '../editor/useElementDrag'
import type { TextElement } from '../model/presentation'

interface TextElementViewProps {
  element: TextElement
  canvasSize: { width: number; height: number }
  scale: number
  selected: boolean
  showResizeHandle: boolean
  editing: boolean
  positionLocked?: boolean
  previewOffset?: Point
  onSelect: (additive: boolean) => void
  onStartEditing: () => void
  onStopEditing: () => void
  onTextChange: (text: string) => void
  transformMoveDelta?: (delta: Point) => Point
  onMovePreview?: (delta: Point) => void
  onMoveCommit: (point: Point, delta: Point) => void
  onMoveCancel?: () => void
  onResizeCommit: (size: Size) => void
}

export function TextElementView({
  element,
  canvasSize,
  scale,
  selected,
  showResizeHandle,
  editing,
  positionLocked = false,
  previewOffset = { x: 0, y: 0 },
  onSelect,
  onStartEditing,
  onStopEditing,
  onTextChange,
  transformMoveDelta,
  onMovePreview,
  onMoveCommit,
  onMoveCancel,
  onResizeCommit,
}: TextElementViewProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const compositionRef = useRef(false)
  const { position, size, pointerHandlers, resizeHandleProps } = useElementDrag({
    position: { x: element.x, y: element.y },
    size: element,
    canvasSize,
    scale,
    disabled: editing || positionLocked,
    onSelect,
    transformMoveDelta,
    onMovePreview,
    onMoveCommit,
    onMoveCancel,
    onResizeCommit,
  })

  useEffect(() => {
    if (!editing) return
    textareaRef.current?.focus()
    textareaRef.current?.select()
  }, [editing])

  return (
    <div
      className={`slide-element text-element${selected ? ' is-selected' : ''}${editing ? ' is-editing' : ''}${positionLocked ? ' is-position-locked' : ''}`}
      data-element-id={element.id}
      style={{
        left: position.x + previewOffset.x,
        top: position.y + previewOffset.y,
        width: size.width,
        height: size.height,
      }}
      {...pointerHandlers}
      onDoubleClick={(event) => {
        event.stopPropagation()
        onSelect(false)
        onStartEditing()
      }}
    >
      <textarea
        ref={textareaRef}
        aria-label="文字內容"
        className="text-element__input"
        value={element.text}
        readOnly={!editing}
        tabIndex={editing ? 0 : -1}
        style={{
          fontSize: element.style.fontSize,
          color: element.style.color,
          textAlign: element.style.textAlign,
          fontFamily: element.style.fontFamily ?? 'sans-serif',
          fontWeight: element.style.fontWeight ?? 'normal',
          fontStyle: element.style.fontStyle ?? 'normal',
          lineHeight: element.style.lineHeight ?? 1.2,
          opacity: element.opacity ?? 1,
        }}
        onChange={(event) => onTextChange(event.target.value)}
        onBlur={() => {
          compositionRef.current = false
          onStopEditing()
        }}
        onCompositionStart={() => {
          compositionRef.current = true
        }}
        onCompositionEnd={() => {
          compositionRef.current = false
        }}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape' && !compositionRef.current) {
            event.currentTarget.blur()
          }
        }}
        onPointerDown={(event) => {
          if (editing) event.stopPropagation()
        }}
      />
      {showResizeHandle && !editing && (
        <button
          className="resize-handle"
          type="button"
          aria-label="調整文字框大小"
          {...resizeHandleProps}
        />
      )}
    </div>
  )
}
