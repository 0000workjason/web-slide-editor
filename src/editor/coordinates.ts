export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

const MINIMUM_SIZE = { width: 80, height: 50 }

export function screenDeltaToCanvas(
  deltaX: number,
  deltaY: number,
  scale: number,
): Point {
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError('Canvas scale must be greater than zero.')
  }

  return {
    x: deltaX / scale,
    y: deltaY / scale,
  }
}

export function clampElementPosition(
  point: Point,
  elementSize: { width: number; height: number },
  canvasSize: { width: number; height: number },
): Point {
  const maximumX = Math.max(0, canvasSize.width - elementSize.width)
  const maximumY = Math.max(0, canvasSize.height - elementSize.height)

  return {
    x: Math.min(Math.max(0, point.x), maximumX),
    y: Math.min(Math.max(0, point.y), maximumY),
  }
}

export function resizeElement(
  position: Point,
  size: Size,
  delta: Point,
  canvasSize: Size,
  lockAspectRatio = false,
): Size {
  const maximumWidth = Math.max(1, canvasSize.width - position.x)
  const maximumHeight = Math.max(1, canvasSize.height - position.y)

  if (!lockAspectRatio) {
    return {
      width: Math.round(clamp(
        size.width + delta.x,
        Math.min(MINIMUM_SIZE.width, maximumWidth),
        maximumWidth,
      )),
      height: Math.round(clamp(
        size.height + delta.y,
        Math.min(MINIMUM_SIZE.height, maximumHeight),
        maximumHeight,
      )),
    }
  }

  const aspectRatio = size.width / size.height
  const widthFromX = size.width + delta.x
  const widthFromY = (size.height + delta.y) * aspectRatio
  const targetWidth = Math.abs(delta.x / size.width) >= Math.abs(delta.y / size.height)
    ? widthFromX
    : widthFromY
  const maximumAspectWidth = Math.min(
    maximumWidth,
    maximumHeight * aspectRatio,
  )
  const minimumAspectWidth = Math.min(
    Math.max(MINIMUM_SIZE.width, MINIMUM_SIZE.height * aspectRatio),
    maximumAspectWidth,
  )
  const width = Math.round(clamp(
    targetWidth,
    minimumAspectWidth,
    maximumAspectWidth,
  ))

  return { width, height: Math.round(width / aspectRatio) }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}
