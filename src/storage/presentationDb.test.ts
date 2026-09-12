// @vitest-environment node

import { beforeEach, describe, expect, it } from 'vitest'
import {
  createImageElement,
  createInitialDocument,
} from '../model/presentation'
import { presentationReducer } from '../editor/presentationReducer'
import {
  deletePresentationDatabase,
  loadAsset,
  loadPresentation,
  saveAsset,
  savePresentation,
  saveProject,
} from './presentationDb'

describe('presentationDb', () => {
  beforeEach(async () => {
    await deletePresentationDatabase()
  })

  it('round-trips a document and its referenced image Blob', async () => {
    const initial = createInitialDocument()
    const image = createImageElement(
      'image-1',
      'asset-1',
      'research-chart.png',
      { width: 1200, height: 800 },
    )
    const document = presentationReducer(initial, {
      type: 'element/add',
      slideId: 'slide-1',
      element: image,
    })
    const blob = new Blob(['png-data'], { type: 'image/png' })

    await saveAsset({
      id: image.assetId,
      blob,
      mimeType: 'image/png',
      fileName: image.alt,
      width: 1200,
      height: 800,
      createdAt: '2026-09-10T00:00:00.000Z',
    })
    await savePresentation(document)

    const restoredDocument = await loadPresentation()
    const restoredAsset = await loadAsset(image.assetId)
    expect(restoredDocument).toEqual(document)
    expect(restoredAsset).toMatchObject({
      id: image.assetId,
      fileName: image.alt,
      width: 1200,
      height: 800,
    })
    expect(restoredAsset?.blob.size).toBe(blob.size)
  })

  it('returns null when no presentation has been saved', async () => {
    await expect(loadPresentation()).resolves.toBeNull()
  })

  it('stores an imported document and assets in one project operation', async () => {
    const document = createInitialDocument()
    const asset = {
      id: 'asset-imported',
      blob: new Blob(['image'], { type: 'image/png' }),
      mimeType: 'image/png' as const,
      fileName: 'imported.png',
      width: 100,
      height: 80,
      createdAt: '2026-09-11T00:00:00.000Z',
    }

    await saveProject(document, [asset])

    await expect(loadPresentation()).resolves.toEqual(document)
    await expect(loadAsset(asset.id)).resolves.toMatchObject({
      fileName: 'imported.png',
    })
  })
})
