import type {
  ImageElement,
  PresentationDocument,
  ShapeElement,
  SlideElement,
  SlideTransition,
  TextElement,
} from '../model/presentation'

type ElementFrame = Pick<SlideElement, 'x' | 'y' | 'width' | 'height'>
type LayerDirection = 'front' | 'forward' | 'backward' | 'back'

export type PresentationAction =
  | { type: 'document/replace'; document: PresentationDocument }
  | { type: 'document/set-name'; name: string }
  | {
      type: 'slide/add'
      slide: PresentationDocument['slides'][string]
      afterSlideId?: string
    }
  | { type: 'slide/delete'; slideId: string }
  | { type: 'slide/move'; slideId: string; toIndex: number }
  | { type: 'slide/set-background'; slideId: string; background: string }
  | { type: 'slide/set-notes'; slideId: string; notes: string }
  | { type: 'slide/set-hidden'; slideId: string; hidden: boolean }
  | { type: 'slide/set-transition'; slideId: string; transition: SlideTransition }
  | { type: 'element/add'; slideId: string; element: SlideElement }
  | { type: 'element/add-many'; slideId: string; elements: SlideElement[] }
  | {
      type: 'element/move'
      slideId: string
      elementId: string
      x: number
      y: number
    }
  | {
      type: 'element/set-frame'
      slideId: string
      elementId: string
      frame: ElementFrame
    }
  | { type: 'element/set-frames'; slideId: string; frames: Record<string, ElementFrame> }
  | { type: 'element/translate'; slideId: string; elementIds: string[]; x: number; y: number }
  | {
      type: 'element/set-text'
      slideId: string
      elementId: string
      text: string
    }
  | {
      type: 'element/set-style'
      slideId: string
      elementId: string
      style: Partial<TextElement['style']>
    }
  | {
      type: 'element/set-image'
      slideId: string
      elementId: string
      image: Partial<Pick<ImageElement, 'assetId' | 'alt' | 'fit' | 'position'>>
    }
  | {
      type: 'element/set-shape'
      slideId: string
      elementId: string
      shape: Partial<Pick<ShapeElement, 'shape' | 'style'>>
    }
  | { type: 'element/set-group'; slideId: string; elementIds: string[]; groupId?: string }
  | {
      type: 'element/set-position-lock'
      slideId: string
      elementIds: string[]
      locked: boolean
    }
  | { type: 'element/set-opacity'; slideId: string; elementId: string; opacity: number }
  | { type: 'element/set-rotation'; slideId: string; elementId: string; rotation: number }
  | {
      type: 'element/toggle-flip'
      slideId: string
      elementId: string
      axis: 'horizontal' | 'vertical'
    }
  | { type: 'element/reorder'; slideId: string; elementIds: string[]; direction: LayerDirection }
  | { type: 'element/delete'; slideId: string; elementId: string }
  | { type: 'element/delete-many'; slideId: string; elementIds: string[] }

export function presentationReducer(
  document: PresentationDocument,
  action: PresentationAction,
): PresentationDocument {
  if (action.type === 'document/replace') return action.document
  if (action.type === 'document/set-name') {
    return document.name === action.name
      ? document
      : { ...document, name: action.name }
  }

  if (action.type === 'slide/add') {
    if (document.slides[action.slide.id]) return document

    const afterIndex = action.afterSlideId
      ? document.slideOrder.indexOf(action.afterSlideId)
      : -1
    const insertIndex = afterIndex >= 0
      ? afterIndex + 1
      : document.slideOrder.length
    const slideOrder = [...document.slideOrder]
    slideOrder.splice(insertIndex, 0, action.slide.id)

    return {
      ...document,
      slideOrder,
      slides: { ...document.slides, [action.slide.id]: action.slide },
    }
  }

  if (action.type === 'slide/delete') {
    if (
      document.slideOrder.length === 1 ||
      !document.slides[action.slideId] ||
      document.slideOrder.every(
        (slideId) => slideId === action.slideId || document.slides[slideId].hidden,
      )
    ) {
      return document
    }

    const slides = { ...document.slides }
    delete slides[action.slideId]
    return {
      ...document,
      slideOrder: document.slideOrder.filter((id) => id !== action.slideId),
      slides,
    }
  }

  if (action.type === 'slide/move') {
    const fromIndex = document.slideOrder.indexOf(action.slideId)
    const toIndex = Math.max(
      0,
      Math.min(document.slideOrder.length - 1, Math.trunc(action.toIndex)),
    )
    if (fromIndex < 0 || fromIndex === toIndex) return document

    const slideOrder = [...document.slideOrder]
    slideOrder.splice(fromIndex, 1)
    slideOrder.splice(toIndex, 0, action.slideId)
    return { ...document, slideOrder }
  }

  const slide = document.slides[action.slideId]
  if (!slide) return document

  if (action.type === 'slide/set-background') {
    return slide.background === action.background
      ? document
      : updateSlide(document, action.slideId, {
          ...slide,
          background: action.background,
        })
  }

  if (action.type === 'slide/set-notes') {
    return (slide.notes ?? '') === action.notes
      ? document
      : updateSlide(document, action.slideId, { ...slide, notes: action.notes })
  }

  if (action.type === 'slide/set-hidden') {
    if (slide.hidden === action.hidden) return document
    const visibleSlides = document.slideOrder.filter(
      (slideId) => !document.slides[slideId].hidden,
    )
    if (action.hidden && visibleSlides.length === 1) return document
    const nextSlide = { ...slide }
    if (action.hidden) nextSlide.hidden = true
    else delete nextSlide.hidden
    return updateSlide(document, action.slideId, nextSlide)
  }

  if (action.type === 'slide/set-transition') {
    if ((slide.transition ?? 'none') === action.transition) return document
    const nextSlide = { ...slide }
    if (action.transition === 'none') delete nextSlide.transition
    else nextSlide.transition = action.transition
    return updateSlide(document, action.slideId, nextSlide)
  }

  if (action.type === 'element/add') {
    return updateSlide(document, action.slideId, {
      ...slide,
      elements: [...slide.elements, action.element],
    })
  }

  if (action.type === 'element/add-many') {
    if (action.elements.length === 0) return document
    return updateSlide(document, action.slideId, {
      ...slide,
      elements: [...slide.elements, ...action.elements],
    })
  }

  if (action.type === 'element/delete' || action.type === 'element/delete-many') {
    const deletedIds = new Set(
      action.type === 'element/delete' ? [action.elementId] : action.elementIds,
    )
    const elements = slide.elements.filter(
      (element) => !deletedIds.has(element.id),
    )
    if (elements.length === slide.elements.length) return document

    return updateSlide(document, action.slideId, { ...slide, elements })
  }

  if (action.type === 'element/reorder') {
    const elements = reorderElements(
      slide.elements,
      new Set(action.elementIds),
      action.direction,
    )
    return elements.every((element, index) => element === slide.elements[index])
      ? document
      : updateSlide(document, action.slideId, { ...slide, elements })
  }

  if (action.type === 'element/set-group') {
    const ids = new Set(action.elementIds)
    let changed = false
    const elements = slide.elements.map((element) => {
      if (!ids.has(element.id) || element.groupId === action.groupId) return element
      changed = true
      if (action.groupId) return { ...element, groupId: action.groupId }
      const ungrouped = { ...element }
      delete ungrouped.groupId
      return ungrouped
    })
    return changed
      ? updateSlide(document, action.slideId, { ...slide, elements })
      : document
  }

  if (action.type === 'element/set-position-lock') {
    const ids = new Set(action.elementIds)
    let changed = false
    const elements = slide.elements.map((element) => {
      if (!ids.has(element.id) || Boolean(element.positionLocked) === action.locked) {
        return element
      }
      changed = true
      if (action.locked) return { ...element, positionLocked: true }
      const unlocked = { ...element }
      delete unlocked.positionLocked
      return unlocked
    })
    return changed
      ? updateSlide(document, action.slideId, { ...slide, elements })
      : document
  }

  if (action.type === 'element/translate') {
    const ids = new Set(action.elementIds)
    let changed = false
    const elements = slide.elements.map((element) => {
      if (
        !ids.has(element.id) ||
        element.positionLocked ||
        (action.x === 0 && action.y === 0)
      ) return element
      changed = true
      return { ...element, x: element.x + action.x, y: element.y + action.y }
    })
    return changed
      ? updateSlide(document, action.slideId, { ...slide, elements })
      : document
  }

  if (action.type === 'element/set-frames') {
    let changed = false
    const elements = slide.elements.map((element) => {
      const frame = action.frames[element.id]
      if (!frame || element.positionLocked) return element
      if (
        element.x === frame.x &&
        element.y === frame.y &&
        element.width === frame.width &&
        element.height === frame.height
      ) return element
      changed = true
      return { ...element, ...frame }
    })
    return changed
      ? updateSlide(document, action.slideId, { ...slide, elements })
      : document
  }

  let changed = false
  const elements = slide.elements.map((element) => {
    if (element.id !== action.elementId) return element

    if (action.type === 'element/set-opacity') {
      if (element.opacity === action.opacity) return element
      changed = true
      return { ...element, opacity: action.opacity }
    }

    if (action.type === 'element/set-rotation') {
      if (element.positionLocked || element.rotation === action.rotation) return element
      changed = true
      return { ...element, rotation: action.rotation }
    }

    if (action.type === 'element/toggle-flip' && element.type !== 'text') {
      changed = true
      return action.axis === 'horizontal'
        ? { ...element, flipHorizontal: !element.flipHorizontal }
        : { ...element, flipVertical: !element.flipVertical }
    }

    if (action.type === 'element/move') {
      if (element.positionLocked) return element
      if (element.x === action.x && element.y === action.y) return element
      changed = true
      return { ...element, x: action.x, y: action.y }
    }

    if (action.type === 'element/set-frame') {
      if (element.positionLocked) return element
      const { x, y, width, height } = action.frame
      if (
        element.x === x &&
        element.y === y &&
        element.width === width &&
        element.height === height
      ) {
        return element
      }
      changed = true
      return { ...element, x, y, width, height }
    }

    if (element.type === 'text' && action.type === 'element/set-text') {
      if (element.text === action.text) return element
      changed = true
      return { ...element, text: action.text }
    }

    if (element.type === 'text' && action.type === 'element/set-style') {
      const style = { ...element.style, ...action.style }
      if (
        style.fontSize === element.style.fontSize &&
        style.color === element.style.color &&
        style.textAlign === element.style.textAlign &&
        style.fontFamily === element.style.fontFamily &&
        style.fontWeight === element.style.fontWeight &&
        style.fontStyle === element.style.fontStyle &&
        style.lineHeight === element.style.lineHeight
      ) {
        return element
      }
      changed = true
      return { ...element, style }
    }

    if (element.type === 'image' && action.type === 'element/set-image') {
      const image = { ...element, ...action.image }
      if (
        image.assetId === element.assetId &&
        image.alt === element.alt &&
        image.fit === element.fit &&
        image.position === element.position
      ) return element
      changed = true
      return image
    }

    if (element.type === 'shape' && action.type === 'element/set-shape') {
      const next = {
        ...element,
        ...action.shape,
        style: action.shape.style
          ? { ...element.style, ...action.shape.style }
          : element.style,
      }
      if (
        next.shape === element.shape &&
        next.style.fill === element.style.fill &&
        next.style.stroke === element.style.stroke &&
        next.style.strokeWidth === element.style.strokeWidth
      ) return element
      changed = true
      return next
    }

    return element
  })

  return changed
    ? updateSlide(document, action.slideId, { ...slide, elements })
    : document
}

function reorderElements(
  elements: SlideElement[],
  selected: Set<string>,
  direction: LayerDirection,
) {
  if (direction === 'front') {
    return [
      ...elements.filter((element) => !selected.has(element.id)),
      ...elements.filter((element) => selected.has(element.id)),
    ]
  }
  if (direction === 'back') {
    return [
      ...elements.filter((element) => selected.has(element.id)),
      ...elements.filter((element) => !selected.has(element.id)),
    ]
  }

  const reordered = [...elements]
  if (direction === 'forward') {
    for (let index = reordered.length - 2; index >= 0; index -= 1) {
      if (
        selected.has(reordered[index].id) &&
        !selected.has(reordered[index + 1].id)
      ) {
        ;[reordered[index], reordered[index + 1]] = [
          reordered[index + 1],
          reordered[index],
        ]
      }
    }
  } else {
    for (let index = 1; index < reordered.length; index += 1) {
      if (
        selected.has(reordered[index].id) &&
        !selected.has(reordered[index - 1].id)
      ) {
        ;[reordered[index], reordered[index - 1]] = [
          reordered[index - 1],
          reordered[index],
        ]
      }
    }
  }
  return reordered
}

function updateSlide(
  document: PresentationDocument,
  slideId: string,
  slide: PresentationDocument['slides'][string],
): PresentationDocument {
  return {
    ...document,
    slides: {
      ...document.slides,
      [slideId]: slide,
    },
  }
}
