import { describe, expect, it, vi } from 'vitest'
import { preparePrint } from './preparePrint'

describe('preparePrint', () => {
  it('decodes every rendered image before resolving', async () => {
    const root = document.createElement('section')
    const firstImage = document.createElement('img')
    const secondImage = document.createElement('img')
    const firstDecode = vi.fn().mockResolvedValue(undefined)
    const secondDecode = vi.fn().mockRejectedValue(new Error('broken image'))
    firstImage.decode = firstDecode
    secondImage.decode = secondDecode
    root.append(firstImage, secondImage)

    await expect(preparePrint(root)).resolves.toBeUndefined()
    expect(firstDecode).toHaveBeenCalledOnce()
    expect(secondDecode).toHaveBeenCalledOnce()
  })
})
