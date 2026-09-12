import { describe, expect, it } from 'vitest'
import { MAX_IMAGE_BYTES, validateImageFile } from './imageImport'

describe('validateImageFile', () => {
  it('accepts PNG and JPEG files within the size limit', () => {
    expect(
      validateImageFile(new File(['png'], 'chart.png', { type: 'image/png' })),
    ).toBeNull()
    expect(
      validateImageFile(new File(['jpg'], 'photo.jpg', { type: 'image/jpeg' })),
    ).toBeNull()
  })

  it('rejects unsupported formats and oversized images', () => {
    expect(
      validateImageFile(new File(['gif'], 'animation.gif', { type: 'image/gif' })),
    ).toBe('只支援 PNG 或 JPEG 圖片。')

    const oversizedFile = new File(['x'], 'large.png', { type: 'image/png' })
    Object.defineProperty(oversizedFile, 'size', { value: MAX_IMAGE_BYTES + 1 })
    expect(validateImageFile(oversizedFile)).toBe('圖片不可超過 20 MB。')
  })
})
