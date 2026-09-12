import type {
  PresentationDocument,
  SlideElement,
} from '../model/presentation'
import type { Point } from './coordinates'

export type Alignment =
  | 'left'
  | 'center'
  | 'right'
  | 'top'
  | 'middle'
  | 'bottom'

type Frame = Pick<SlideElement, 'x' | 'y' | 'width' | 'height'>

interface Bounds extends Frame {
  right: number
  bottom: number
}

export function selectionBounds(elements: SlideElement[]): Bounds {
  const x = Math.min(...elements.map((element) => element.x))
  const y = Math.min(...elements.map((element) => element.y))
  const right = Math.max(...elements.map((element) => element.x + element.width))
  const bottom = Math.max(...elements.map((element) => element.y + element.height))
  return { x, y, right, bottom, width: right - x, height: bottom - y }
}

export function alignElements(
  elements: SlideElement[],
  alignment: Alignment,
  canvas: PresentationDocument['canvas'],
): Record<string, Frame> {
  if (elements.length === 0) return {}
  const bounds = elements.length === 1
    ? { x: 0, y: 0, right: canvas.width, bottom: canvas.height,
        width: canvas.width, height: canvas.height }
    : selectionBounds(elements)

  return Object.fromEntries(elements.map((element) => {
    let x = element.x
    let y = element.y
    if (alignment === 'left') x = bounds.x
    if (alignment === 'center') x = bounds.x + (bounds.width - element.width) / 2
    if (alignment === 'right') x = bounds.right - element.width
    if (alignment === 'top') y = bounds.y
    if (alignment === 'middle') y = bounds.y + (bounds.height - element.height) / 2
    if (alignment === 'bottom') y = bounds.bottom - element.height
    return [element.id, {
      x: Math.round(x),
      y: Math.round(y),
      width: element.width,
      height: element.height,
    }]
  }))
}

export function distributeElements(
  elements: SlideElement[],
  axis: 'horizontal' | 'vertical',
): Record<string, Frame> {
  if (elements.length < 3) return {}
  const center = (element: SlideElement) => axis === 'horizontal'
    ? element.x + element.width / 2
    : element.y + element.height / 2
  const sorted = [...elements].sort((a, b) => center(a) - center(b))
  const start = center(sorted[0])
  const step = (center(sorted.at(-1)!) - start) / (sorted.length - 1)

  return Object.fromEntries(sorted.map((element, index) => {
    const target = start + step * index
    return [element.id, {
      x: axis === 'horizontal' ? Math.round(target - element.width / 2) : element.x,
      y: axis === 'vertical' ? Math.round(target - element.height / 2) : element.y,
      width: element.width,
      height: element.height,
    }]
  }))
}

export function constrainAndSnapMove(
  selected: SlideElement[],
  otherElements: SlideElement[],
  rawDelta: Point,
  canvas: PresentationDocument['canvas'],
  threshold = 10,
): { delta: Point; guides: { x?: number; y?: number } } {
  const bounds = selectionBounds(selected)
  const delta = {
    x: clamp(Math.round(rawDelta.x), -bounds.x, canvas.width - bounds.right),
    y: clamp(Math.round(rawDelta.y), -bounds.y, canvas.height - bounds.bottom),
  }
  const xTargets = [0, canvas.width / 2, canvas.width].concat(
    otherElements.flatMap((element) => [
      element.x,
      element.x + element.width / 2,
      element.x + element.width,
    ]),
  )
  const yTargets = [0, canvas.height / 2, canvas.height].concat(
    otherElements.flatMap((element) => [
      element.y,
      element.y + element.height / 2,
      element.y + element.height,
    ]),
  )
  const xSnap = closestSnap(
    [bounds.x + delta.x, bounds.x + bounds.width / 2 + delta.x, bounds.right + delta.x],
    xTargets,
    threshold,
  )
  const ySnap = closestSnap(
    [bounds.y + delta.y, bounds.y + bounds.height / 2 + delta.y, bounds.bottom + delta.y],
    yTargets,
    threshold,
  )

  if (xSnap) delta.x += xSnap.offset
  if (ySnap) delta.y += ySnap.offset
  delta.x = clamp(delta.x, -bounds.x, canvas.width - bounds.right)
  delta.y = clamp(delta.y, -bounds.y, canvas.height - bounds.bottom)
  return {
    delta,
    guides: { x: xSnap?.target, y: ySnap?.target },
  }
}

function closestSnap(values: number[], targets: number[], threshold: number) {
  let closest: { offset: number; target: number } | undefined
  for (const value of values) {
    for (const target of targets) {
      const offset = target - value
      if (
        Math.abs(offset) <= threshold &&
        (!closest || Math.abs(offset) < Math.abs(closest.offset))
      ) closest = { offset, target }
    }
  }
  return closest
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}
