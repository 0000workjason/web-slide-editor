import type { SlideElement } from '../model/presentation'

export function getElementTransform(element: SlideElement) {
  return `${getElementRotation(element.rotation)} ${getElementFlipTransform(element)}`
}

export function getElementRotation(rotation = 0) {
  return `rotate(${rotation}deg)`
}

export function getElementFlipTransform(element: SlideElement) {
  const horizontal = element.type !== 'text' && element.flipHorizontal ? -1 : 1
  const vertical = element.type !== 'text' && element.flipVertical ? -1 : 1
  return `scale(${horizontal}, ${vertical})`
}
