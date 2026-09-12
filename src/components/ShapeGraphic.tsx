import type { ShapeElement } from '../model/presentation'

export function ShapeGraphic({ element }: { element: ShapeElement }) {
  if (element.shape === 'line' || element.shape === 'arrow') {
    return (
      <div className="shape-connector" aria-hidden="true">
        <span
          className="shape-connector__line"
          style={{
            height: element.style.strokeWidth,
            background: element.style.stroke,
          }}
        />
        {element.shape === 'arrow' && (
          <span
            className="shape-connector__arrow"
            style={{ borderLeftColor: element.style.stroke }}
          />
        )}
      </div>
    )
  }

  return (
    <div
      className={`shape-element__shape is-${element.shape}`}
      style={{
        background: element.style.fill,
        borderColor: element.style.stroke,
        borderWidth: element.style.strokeWidth,
      }}
    />
  )
}
