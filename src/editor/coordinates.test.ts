import { describe, expect, it } from 'vitest'
import {
  clampElementPosition,
  pointerRotation,
  resizeElement,
  screenDeltaToCanvas,
} from './coordinates'

describe('screenDeltaToCanvas', () => {
  it('converts screen movement using the active scale', () => {
    expect(screenDeltaToCanvas(100, -25, 0.5)).toEqual({ x: 200, y: -50 })
    expect(screenDeltaToCanvas(100, -25, 1.25)).toEqual({ x: 80, y: -20 })
  })

  it('rejects invalid scales', () => {
    expect(() => screenDeltaToCanvas(10, 10, 0)).toThrow(RangeError)
  })
})

describe('clampElementPosition', () => {
  it('keeps the entire element inside the canvas', () => {
    const elementSize = { width: 300, height: 100 }
    const canvasSize = { width: 1600, height: 900 }

    expect(
      clampElementPosition({ x: -20, y: 920 }, elementSize, canvasSize),
    ).toEqual({ x: 0, y: 800 })
  })
})

describe('pointerRotation', () => {
  it('measures clockwise rotation and snaps to 15 degrees with Shift', () => {
    const center = { x: 50, y: 50 }

    expect(pointerRotation(center, { x: 50, y: 0 })).toBe(0)
    expect(pointerRotation(center, { x: 100, y: 50 })).toBe(90)
    expect(pointerRotation(center, { x: 0, y: 50 })).toBe(-90)
    expect(pointerRotation(center, { x: 51, y: 46 }, true)).toBe(15)
  })
})

describe('resizeElement', () => {
  it('resizes text freely and keeps images proportional inside the canvas', () => {
    const canvas = { width: 1600, height: 900 }

    expect(
      resizeElement(
        { x: 100, y: 100 },
        { width: 400, height: 200 },
        { x: 120, y: 80 },
        canvas,
      ),
    ).toEqual({ width: 520, height: 280 })
    expect(
      resizeElement(
        { x: 100, y: 100 },
        { width: 400, height: 200 },
        { x: 200, y: 10 },
        canvas,
        true,
      ),
    ).toEqual({ width: 600, height: 300 })
    expect(
      resizeElement(
        { x: 1400, y: 800 },
        { width: 100, height: 50 },
        { x: 500, y: 500 },
        canvas,
        true,
      ),
    ).toEqual({ width: 200, height: 100 })
  })
})
