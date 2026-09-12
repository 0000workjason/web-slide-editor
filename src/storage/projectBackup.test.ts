// @vitest-environment node

import { beforeEach, describe, expect, it } from 'vitest'
import {
  createImageElement,
  createInitialDocument,
} from '../model/presentation'
import { presentationReducer } from '../editor/presentationReducer'
import {
  deletePresentationDatabase,
  saveAsset,
} from './presentationDb'
import { createProjectBackup, parseProjectBackup } from './projectBackup'

describe('projectBackup', () => {
  beforeEach(async () => {
    await deletePresentationDatabase()
  })

  it('round-trips a document and its referenced image', async () => {
    const image = createImageElement(
      'image-1',
      'asset-1',
      'chart.png',
      { width: 640, height: 480 },
    )
    const document = presentationReducer(createInitialDocument(), {
      type: 'element/add',
      slideId: 'slide-1',
      element: image,
    })
    await saveAsset({
      id: image.assetId,
      blob: new Blob(['png-data'], { type: 'image/png' }),
      mimeType: 'image/png',
      fileName: image.alt,
      width: 640,
      height: 480,
      createdAt: '2026-09-11T00:00:00.000Z',
    })

    const restored = parseProjectBackup(await createProjectBackup(document))

    expect(restored.document).toEqual(document)
    expect(restored.assets[0]).toMatchObject({
      id: 'asset-1',
      fileName: 'chart.png',
    })
    expect(restored.assets[0].blob.size).toBe(8)
  })

  it('rejects malformed data and missing referenced assets', () => {
    expect(() => parseProjectBackup('{broken')).toThrow('not valid JSON')
    const document = presentationReducer(createInitialDocument(), {
      type: 'element/add',
      slideId: 'slide-1',
      element: createImageElement(
        'image-1',
        'asset-1',
        'missing.png',
        { width: 100, height: 100 },
      ),
    })
    expect(() => parseProjectBackup(JSON.stringify({
      backupVersion: 1,
      document,
      assets: [],
    }))).toThrow('references are incomplete')
  })
})
