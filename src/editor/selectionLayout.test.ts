import { describe, expect, it } from 'vitest'
import { createTextElement, DEFAULT_CANVAS } from '../model/presentation'
import {
  alignElements,
  constrainAndSnapMove,
  distributeElements,
} from './selectionLayout'

describe('selection layout', () => {
  it('aligns, distributes, and snaps selected elements', () => {
    const first = { ...createTextElement('a'), x: 100, y: 100, width: 100 }
    const middle = { ...createTextElement('b'), x: 250, y: 220, width: 100 }
    const last = { ...createTextElement('c'), x: 500, y: 340, width: 100 }

    expect(alignElements([first], 'center', DEFAULT_CANVAS).a.x).toBe(750)
    expect(distributeElements([first, middle, last], 'horizontal').b.x).toBe(300)
    expect(constrainAndSnapMove(
      [first],
      [last],
      { x: 295, y: -95 },
      DEFAULT_CANVAS,
    )).toEqual({ delta: { x: 300, y: -100 }, guides: { x: 500, y: 0 } })
  })
})
