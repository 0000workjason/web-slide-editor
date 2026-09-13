import { describe, expect, it } from 'vitest'
import {
  createImageElement,
  createInitialDocument,
  createShapeElement,
  createSlide,
  createTextElement,
  isPresentationDocument,
} from '../model/presentation'
import { presentationReducer } from './presentationReducer'

describe('presentationReducer', () => {
  it('adds, edits, moves, and deletes a text element immutably', () => {
    const initial = createInitialDocument()
    const element = createTextElement('text-1')
    const withText = presentationReducer(initial, {
      type: 'element/add',
      slideId: 'slide-1',
      element,
    })
    const edited = presentationReducer(withText, {
      type: 'element/set-text',
      slideId: 'slide-1',
      elementId: element.id,
      text: '中文研究分享',
    })
    const moved = presentationReducer(edited, {
      type: 'element/move',
      slideId: 'slide-1',
      elementId: element.id,
      x: 320,
      y: 240,
    })
    const resized = presentationReducer(moved, {
      type: 'element/set-frame',
      slideId: 'slide-1',
      elementId: element.id,
      frame: { x: 320, y: 240, width: 640, height: 220 },
    })
    const styled = presentationReducer(resized, {
      type: 'element/set-style',
      slideId: 'slide-1',
      elementId: element.id,
      style: { fontSize: 56, textAlign: 'center', fontWeight: 'bold' },
    })
    const removed = presentationReducer(styled, {
      type: 'element/delete',
      slideId: 'slide-1',
      elementId: element.id,
    })

    expect(initial.slides['slide-1'].elements).toHaveLength(0)
    expect(edited.slides['slide-1'].elements[0]).toMatchObject({
      text: '中文研究分享',
    })
    expect(moved.slides['slide-1'].elements[0]).toMatchObject({ x: 320, y: 240 })
    expect(styled.slides['slide-1'].elements[0]).toMatchObject({
      width: 640,
      height: 220,
      style: { fontSize: 56, textAlign: 'center', fontWeight: 'bold' },
    })
    expect(removed.slides['slide-1'].elements).toHaveLength(0)
  })

  it('returns the same document for an unknown slide', () => {
    const initial = createInitialDocument()
    const result = presentationReducer(initial, {
      type: 'element/delete',
      slideId: 'missing',
      elementId: 'text-1',
    })

    expect(result).toBe(initial)
  })

  it('fits a large image inside the initial canvas without changing its ratio', () => {
    const image = createImageElement(
      'image-1',
      'asset-1',
      'chart.png',
      { width: 2400, height: 1200 },
    )

    expect(image).toMatchObject({
      width: 800,
      height: 400,
      x: 400,
      y: 250,
    })
  })

  it('adds a slide once and preserves its order', () => {
    const initial = createInitialDocument()
    const slide = createSlide('slide-2')
    const withSecondSlide = presentationReducer(initial, {
      type: 'slide/add',
      slide,
    })
    const duplicate = presentationReducer(withSecondSlide, {
      type: 'slide/add',
      slide,
    })

    expect(withSecondSlide.slideOrder).toEqual(['slide-1', 'slide-2'])
    expect(withSecondSlide.slides['slide-2']).toEqual(slide)
    expect(duplicate).toBe(withSecondSlide)
  })

  it('inserts, moves, and deletes slides without leaving orphan records', () => {
    const initial = createInitialDocument()
    const slide2 = createSlide('slide-2')
    const slide3 = createSlide('slide-3')
    const inserted = presentationReducer(
      presentationReducer(initial, { type: 'slide/add', slide: slide3 }),
      { type: 'slide/add', slide: slide2, afterSlideId: 'slide-1' },
    )
    const moved = presentationReducer(inserted, {
      type: 'slide/move',
      slideId: 'slide-3',
      toIndex: 0,
    })
    const deleted = presentationReducer(moved, {
      type: 'slide/delete',
      slideId: 'slide-2',
    })

    expect(inserted.slideOrder).toEqual(['slide-1', 'slide-2', 'slide-3'])
    expect(moved.slideOrder).toEqual(['slide-3', 'slide-1', 'slide-2'])
    expect(deleted.slideOrder).toEqual(['slide-3', 'slide-1'])
    expect(deleted.slides['slide-2']).toBeUndefined()
  })

  it('keeps at least one slide in the document', () => {
    const initial = createInitialDocument()
    const result = presentationReducer(initial, {
      type: 'slide/delete',
      slideId: 'slide-1',
    })

    expect(result).toBe(initial)
  })

  it('updates a grouped selection and its layer order in one action', () => {
    const initial = createInitialDocument()
    const text = createTextElement('text-1')
    const shape = createShapeElement('shape-1', 'rectangle')
    const back = createShapeElement('shape-2', 'ellipse')
    const added = presentationReducer(initial, {
      type: 'element/add-many',
      slideId: 'slide-1',
      elements: [text, shape, back],
    })
    const grouped = presentationReducer(added, {
      type: 'element/set-group',
      slideId: 'slide-1',
      elementIds: [text.id, shape.id],
      groupId: 'group-1',
    })
    const moved = presentationReducer(grouped, {
      type: 'element/translate',
      slideId: 'slide-1',
      elementIds: [text.id, shape.id],
      x: 20,
      y: 10,
    })
    const reordered = presentationReducer(moved, {
      type: 'element/reorder',
      slideId: 'slide-1',
      elementIds: [text.id, shape.id],
      direction: 'front',
    })

    expect(moved.slides['slide-1'].elements.slice(0, 2)).toMatchObject([
      { id: 'text-1', groupId: 'group-1', x: 200, y: 180 },
      { id: 'shape-1', groupId: 'group-1', x: 440, y: 280 },
    ])
    expect(reordered.slides['slide-1'].elements.map((element) => element.id))
      .toEqual(['shape-2', 'text-1', 'shape-1'])
  })

  it('stores speaker notes on the active slide', () => {
    const result = presentationReducer(createInitialDocument(), {
      type: 'slide/set-notes',
      slideId: 'slide-1',
      notes: '說明研究方法與限制',
    })

    expect(result.slides['slide-1'].notes).toBe('說明研究方法與限制')
  })

  it('stores and validates slide transitions', () => {
    const faded = presentationReducer(createInitialDocument(), {
      type: 'slide/set-transition',
      slideId: 'slide-1',
      transition: 'fade',
    })
    const cleared = presentationReducer(faded, {
      type: 'slide/set-transition',
      slideId: 'slide-1',
      transition: 'none',
    })

    expect(faded.slides['slide-1'].transition).toBe('fade')
    expect(cleared.slides['slide-1']).not.toHaveProperty('transition')
    expect(isPresentationDocument(faded)).toBe(true)
    expect(isPresentationDocument({
      ...faded,
      slides: {
        ...faded.slides,
        'slide-1': { ...faded.slides['slide-1'], transition: 'spin' },
      },
    })).toBe(false)
  })

  it('stores output visibility and element presentation controls', () => {
    const initial = presentationReducer(createInitialDocument(), {
      type: 'slide/add',
      slide: createSlide('slide-2'),
    })
    const hidden = presentationReducer(initial, {
      type: 'slide/set-hidden',
      slideId: 'slide-2',
      hidden: true,
    })
    const keepsOneVisible = presentationReducer(hidden, {
      type: 'slide/set-hidden',
      slideId: 'slide-1',
      hidden: true,
    })
    const keepsVisibleSlide = presentationReducer(hidden, {
      type: 'slide/delete',
      slideId: 'slide-1',
    })
    const withText = presentationReducer(hidden, {
      type: 'element/add',
      slideId: 'slide-1',
      element: createTextElement('text-1'),
    })
    const rotated = presentationReducer(withText, {
      type: 'element/set-rotation',
      slideId: 'slide-1',
      elementId: 'text-1',
      rotation: 45,
    })
    const locked = presentationReducer(rotated, {
      type: 'element/set-position-lock',
      slideId: 'slide-1',
      elementIds: ['text-1'],
      locked: true,
    })
    const faded = presentationReducer(locked, {
      type: 'element/set-opacity',
      slideId: 'slide-1',
      elementId: 'text-1',
      opacity: 0.4,
    })
    const staysPut = presentationReducer(faded, {
      type: 'element/translate',
      slideId: 'slide-1',
      elementIds: ['text-1'],
      x: 100,
      y: 100,
    })
    const staysUnrotated = presentationReducer(faded, {
      type: 'element/set-rotation',
      slideId: 'slide-1',
      elementId: 'text-1',
      rotation: -30,
    })

    expect(hidden.slides['slide-2'].hidden).toBe(true)
    expect(keepsOneVisible).toBe(hidden)
    expect(keepsVisibleSlide).toBe(hidden)
    expect(faded.slides['slide-1'].elements[0]).toMatchObject({
      positionLocked: true,
      opacity: 0.4,
      rotation: 45,
    })
    expect(staysPut).toBe(faded)
    expect(staysUnrotated).toBe(faded)
    expect(isPresentationDocument({
      ...hidden,
      slides: {
        ...hidden.slides,
        'slide-1': { ...hidden.slides['slide-1'], hidden: true },
      },
    })).toBe(false)
    expect(isPresentationDocument({
      ...withText,
      slides: {
        ...withText.slides,
        'slide-1': {
          ...withText.slides['slide-1'],
          elements: withText.slides['slide-1'].elements.map((element) => ({
            ...element,
            rotation: 181,
          })),
        },
      },
    })).toBe(false)
  })

  it('flips images and shapes but ignores text', () => {
    const initial = createInitialDocument()
    const withElements = presentationReducer(initial, {
      type: 'element/add-many',
      slideId: 'slide-1',
      elements: [
        createTextElement('text-1'),
        createShapeElement('shape-1', 'arrow'),
      ],
    })
    const horizontal = presentationReducer(withElements, {
      type: 'element/toggle-flip',
      slideId: 'slide-1',
      elementId: 'shape-1',
      axis: 'horizontal',
    })
    const both = presentationReducer(horizontal, {
      type: 'element/toggle-flip',
      slideId: 'slide-1',
      elementId: 'shape-1',
      axis: 'vertical',
    })
    const ignoresText = presentationReducer(both, {
      type: 'element/toggle-flip',
      slideId: 'slide-1',
      elementId: 'text-1',
      axis: 'horizontal',
    })

    expect(both.slides['slide-1'].elements[1]).toMatchObject({
      flipHorizontal: true,
      flipVertical: true,
    })
    expect(ignoresText).toBe(both)
    expect(isPresentationDocument(both)).toBe(true)
    expect(isPresentationDocument({
      ...both,
      slides: {
        ...both.slides,
        'slide-1': {
          ...both.slides['slide-1'],
          elements: both.slides['slide-1'].elements.map((element) => (
            element.id === 'shape-1'
              ? { ...element, flipHorizontal: 'yes' }
              : element
          )),
        },
      },
    })).toBe(false)
  })
})
