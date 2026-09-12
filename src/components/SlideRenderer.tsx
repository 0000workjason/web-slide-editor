import type { HTMLAttributes, ReactNode } from 'react'
import type {
  PresentationDocument,
  Slide,
  SlideElement,
} from '../model/presentation'
import { AssetImage } from './AssetImage'
import { ShapeGraphic } from './ShapeGraphic'

interface SlideRendererProps extends HTMLAttributes<HTMLDivElement> {
  slide: Slide
  canvas: PresentationDocument['canvas']
  renderElement?: (element: SlideElement) => ReactNode
}

export function SlideRenderer({
  slide,
  canvas,
  renderElement,
  children,
  className = '',
  style,
  ...divProps
}: SlideRendererProps) {
  return (
    <div
      {...divProps}
      className={`slide-renderer ${className}`.trim()}
      style={{
        width: canvas.width,
        height: canvas.height,
        background: slide.background,
        ...style,
      }}
    >
      <div className="canvas-accent" aria-hidden="true" />
      {slide.elements.length === 0 && (renderElement || children !== undefined) && (
        <div className="empty-state" aria-hidden="true">
          <span className="empty-state__line" />
          <strong>從一句話開始</strong>
          <span>新增文字或圖片，開始製作這張投影片</span>
        </div>
      )}
      {children ?? slide.elements.map((element) =>
        renderElement ? renderElement(element) : renderStaticElement(element),
      )}
    </div>
  )
}

function renderStaticElement(element: SlideElement) {
  const frameStyle = {
    left: element.x,
    top: element.y,
    width: element.width,
    height: element.height,
    opacity: element.opacity ?? 1,
  }

  if (element.type === 'image') {
    return (
      <div key={element.id} className="static-slide-element" style={frameStyle}>
        <AssetImage
          assetId={element.assetId}
          alt={element.alt}
          fit={element.fit}
          position={element.position}
        />
      </div>
    )
  }

  if (element.type === 'shape') {
    return (
      <div key={element.id} className="static-slide-element" style={frameStyle}>
        <ShapeGraphic element={element} />
      </div>
    )
  }

  return (
    <div
      key={element.id}
      className="static-slide-element static-text-element"
      style={{
        ...frameStyle,
        fontSize: element.style.fontSize,
        color: element.style.color,
        textAlign: element.style.textAlign,
        fontFamily: element.style.fontFamily ?? 'sans-serif',
        fontWeight: element.style.fontWeight ?? 'normal',
        fontStyle: element.style.fontStyle ?? 'normal',
        lineHeight: element.style.lineHeight ?? 1.2,
      }}
    >
      {element.text}
    </div>
  )
}
