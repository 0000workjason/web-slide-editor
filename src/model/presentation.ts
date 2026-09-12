export const DEFAULT_CANVAS = { width: 1600, height: 900 } as const

export type TextAlign = 'left' | 'center' | 'right'
export type FontFamily = 'sans-serif' | 'serif' | 'monospace'
export type ImageFit = 'contain' | 'cover'
export type ImagePosition = 'center' | 'top' | 'right' | 'bottom' | 'left'
export type ShapeKind = 'rectangle' | 'ellipse' | 'line' | 'arrow'

interface ElementFrame {
  id: string
  x: number
  y: number
  width: number
  height: number
  groupId?: string
  positionLocked?: boolean
  opacity?: number
}

export interface TextElement extends ElementFrame {
  type: 'text'
  text: string
  style: {
    fontSize: number
    color: string
    textAlign: TextAlign
    fontFamily?: FontFamily
    fontWeight?: 'normal' | 'bold'
    fontStyle?: 'normal' | 'italic'
    lineHeight?: number
  }
}

export interface ImageElement extends ElementFrame {
  type: 'image'
  assetId: string
  alt: string
  fit?: ImageFit
  position?: ImagePosition
}

export interface ShapeElement extends ElementFrame {
  type: 'shape'
  shape: ShapeKind
  style: {
    fill: string
    stroke: string
    strokeWidth: number
  }
}

export type SlideElement = TextElement | ImageElement | ShapeElement

export interface Slide {
  id: string
  background: string
  notes?: string
  hidden?: boolean
  elements: SlideElement[]
}

export interface PresentationDocument {
  schemaVersion: 1
  name: string
  canvas: {
    width: number
    height: number
  }
  slideOrder: string[]
  slides: Record<string, Slide>
}

export function createInitialDocument(): PresentationDocument {
  const slide = createSlide('slide-1')

  return {
    schemaVersion: 1,
    name: '未命名簡報',
    canvas: { ...DEFAULT_CANVAS },
    slideOrder: [slide.id],
    slides: { [slide.id]: slide },
  }
}

export function createSlide(id: string): Slide {
  return {
    id,
    background: '#ffffff',
    elements: [],
  }
}

export function createTextElement(id: string, placementIndex = 0): TextElement {
  const offset = (placementIndex % 8) * 24
  return {
    id,
    type: 'text',
    x: 180 + offset,
    y: 170 + offset,
    width: 520,
    height: 150,
    text: '輸入文字',
    style: {
      fontSize: 44,
      color: '#172039',
      textAlign: 'left',
      fontFamily: 'sans-serif',
      fontWeight: 'normal',
      fontStyle: 'normal',
      lineHeight: 1.2,
    },
  }
}

export function createImageElement(
  id: string,
  assetId: string,
  alt: string,
  intrinsicSize: { width: number; height: number },
): ImageElement {
  const maximumSize = { width: 800, height: 500 }
  const fitScale = Math.min(
    1,
    maximumSize.width / intrinsicSize.width,
    maximumSize.height / intrinsicSize.height,
  )
  const width = Math.round(intrinsicSize.width * fitScale)
  const height = Math.round(intrinsicSize.height * fitScale)

  return {
    id,
    type: 'image',
    assetId,
    alt,
    x: Math.round((DEFAULT_CANVAS.width - width) / 2),
    y: Math.round((DEFAULT_CANVAS.height - height) / 2),
    width,
    height,
  }
}

export function createShapeElement(
  id: string,
  shape: ShapeKind,
  placementIndex = 0,
): ShapeElement {
  const offset = (placementIndex % 8) * 24
  const isConnector = shape === 'line' || shape === 'arrow'
  return {
    id,
    type: 'shape',
    shape,
    x: 420 + offset,
    y: 270 + offset,
    width: isConnector ? 420 : 360,
    height: isConnector ? 80 : 220,
    style: {
      fill: '#dfe4ff',
      stroke: '#4c61ff',
      strokeWidth: 4,
    },
  }
}

export function isPresentationDocument(
  value: unknown,
): value is PresentationDocument {
  if (!isRecord(value) || value.schemaVersion !== 1) return false
  if (
    typeof value.name !== 'string' ||
    value.name.length > 80 ||
    !isRecord(value.canvas)
  ) return false
  if (
    !isPositiveNumber(value.canvas.width) ||
    !isPositiveNumber(value.canvas.height) ||
    !Array.isArray(value.slideOrder) ||
    value.slideOrder.length === 0 ||
    !value.slideOrder.every((id) => typeof id === 'string') ||
    !isRecord(value.slides)
  ) {
    return false
  }

  const slideOrder = value.slideOrder
  const slides = value.slides
  const canvas = {
    width: value.canvas.width,
    height: value.canvas.height,
  }
  if (
    new Set(slideOrder).size !== slideOrder.length ||
    Object.keys(slides).length !== slideOrder.length
  ) {
    return false
  }

  return slideOrder.some((slideId) => {
    const slide = slides[slideId]
    return isRecord(slide) && slide.hidden !== true
  }) && slideOrder.every((slideId) => {
    const slide = slides[slideId]
    if (!isRecord(slide) || !Array.isArray(slide.elements)) return false
    const elementIds = slide.elements.flatMap((element) =>
      isRecord(element) && typeof element.id === 'string' ? [element.id] : [],
    )
    return (
      slide.id === slideId &&
      typeof slide.background === 'string' &&
      (slide.notes === undefined ||
        (typeof slide.notes === 'string' && slide.notes.length <= 5000)) &&
      (slide.hidden === undefined || typeof slide.hidden === 'boolean') &&
      elementIds.length === slide.elements.length &&
      new Set(elementIds).size === elementIds.length &&
      slide.elements.every((element) => isSlideElement(element, canvas))
    )
  })
}

function isSlideElement(
  value: unknown,
  canvas: PresentationDocument['canvas'],
): value is SlideElement {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    (value.groupId !== undefined && typeof value.groupId !== 'string') ||
    (value.positionLocked !== undefined &&
      typeof value.positionLocked !== 'boolean') ||
    (value.opacity !== undefined &&
      (!isNonNegativeNumber(value.opacity) || value.opacity > 1)) ||
    !isNonNegativeNumber(value.x) ||
    !isNonNegativeNumber(value.y) ||
    !isPositiveNumber(value.width) ||
    !isPositiveNumber(value.height) ||
    value.x + value.width > canvas.width ||
    value.y + value.height > canvas.height
  ) {
    return false
  }

  if (value.type === 'image') {
    return (
      typeof value.assetId === 'string' &&
      typeof value.alt === 'string' &&
      (value.fit === undefined || ['contain', 'cover'].includes(String(value.fit))) &&
      (value.position === undefined ||
        ['center', 'top', 'right', 'bottom', 'left'].includes(String(value.position)))
    )
  }

  if (value.type === 'shape') {
    return (
      ['rectangle', 'ellipse', 'line', 'arrow'].includes(String(value.shape)) &&
      isRecord(value.style) &&
      typeof value.style.fill === 'string' &&
      typeof value.style.stroke === 'string' &&
      isNonNegativeNumber(value.style.strokeWidth) &&
      value.style.strokeWidth <= 40
    )
  }

  return (
    value.type === 'text' &&
    typeof value.text === 'string' &&
    isRecord(value.style) &&
    isPositiveNumber(value.style.fontSize) &&
    typeof value.style.color === 'string' &&
    ['left', 'center', 'right'].includes(String(value.style.textAlign)) &&
    (value.style.fontFamily === undefined ||
      ['sans-serif', 'serif', 'monospace'].includes(String(value.style.fontFamily))) &&
    (value.style.fontWeight === undefined ||
      ['normal', 'bold'].includes(String(value.style.fontWeight))) &&
    (value.style.fontStyle === undefined ||
      ['normal', 'italic'].includes(String(value.style.fontStyle))) &&
    (value.style.lineHeight === undefined ||
      (isPositiveNumber(value.style.lineHeight) && value.style.lineHeight <= 3))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}
