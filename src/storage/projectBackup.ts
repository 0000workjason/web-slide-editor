import {
  isPresentationDocument,
  type PresentationDocument,
} from '../model/presentation'
import { loadAsset, type AssetRecord } from './presentationDb'

export const MAX_PROJECT_BYTES = 32 * 1024 * 1024

interface SerializedAsset extends Omit<AssetRecord, 'blob'> {
  dataUrl: string
}

interface ProjectBackup {
  backupVersion: 1
  document: PresentationDocument
  assets: SerializedAsset[]
}

export async function createProjectBackup(
  document: PresentationDocument,
): Promise<string> {
  const assetIds = referencedAssetIds(document)
  const assets = await Promise.all(assetIds.map(async (assetId) => {
    const asset = await loadAsset(assetId)
    if (!asset) throw new Error('A referenced image asset is missing.')
    const { blob, ...metadata } = asset
    return {
      ...metadata,
      dataUrl: await blobToDataUrl(blob, metadata.mimeType),
    }
  }))

  return JSON.stringify({
    backupVersion: 1,
    document,
    assets,
  } satisfies ProjectBackup)
}

export async function readProjectBackup(
  file: File,
): Promise<{ document: PresentationDocument; assets: AssetRecord[] }> {
  if (file.size > MAX_PROJECT_BYTES) {
    throw new Error('The project file is too large.')
  }
  return parseProjectBackup(await file.text())
}

export function parseProjectBackup(
  source: string,
): { document: PresentationDocument; assets: AssetRecord[] } {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    throw new Error('The project file is not valid JSON.')
  }

  if (
    !isRecord(value) ||
    value.backupVersion !== 1 ||
    !isPresentationDocument(value.document) ||
    !Array.isArray(value.assets)
  ) {
    throw new Error('The project file uses an invalid format.')
  }

  const expectedIds = new Set(referencedAssetIds(value.document))
  const seenIds = new Set<string>()
  const assets = value.assets.map((asset): AssetRecord => {
    if (!isSerializedAsset(asset) || seenIds.has(asset.id)) {
      throw new Error('The project contains an invalid image asset.')
    }
    seenIds.add(asset.id)
    return {
      id: asset.id,
      blob: dataUrlToBlob(asset.dataUrl, asset.mimeType),
      mimeType: asset.mimeType,
      fileName: asset.fileName,
      width: asset.width,
      height: asset.height,
      createdAt: asset.createdAt,
    }
  })

  if (
    seenIds.size !== expectedIds.size ||
    [...seenIds].some((id) => !expectedIds.has(id))
  ) {
    throw new Error('The project image references are incomplete.')
  }

  return { document: value.document, assets }
}

function referencedAssetIds(document: PresentationDocument) {
  return [...new Set(document.slideOrder.flatMap((slideId) =>
    document.slides[slideId].elements.flatMap((element) =>
      element.type === 'image' ? [element.assetId] : [],
    ),
  ))]
}

async function blobToDataUrl(
  blob: Blob,
  mimeType: AssetRecord['mimeType'],
): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return `data:${mimeType};base64,${btoa(binary)}`
}

function dataUrlToBlob(
  dataUrl: string,
  mimeType: AssetRecord['mimeType'],
) {
  const prefix = `data:${mimeType};base64,`
  if (!dataUrl.startsWith(prefix)) {
    throw new Error('The project contains an invalid image encoding.')
  }
  let binary: string
  try {
    binary = atob(dataUrl.slice(prefix.length))
  } catch {
    throw new Error('The project contains an invalid image encoding.')
  }
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: mimeType })
}

function isSerializedAsset(value: unknown): value is SerializedAsset {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (value.mimeType === 'image/png' || value.mimeType === 'image/jpeg') &&
    typeof value.fileName === 'string' &&
    isPositiveNumber(value.width) &&
    isPositiveNumber(value.height) &&
    typeof value.createdAt === 'string' &&
    typeof value.dataUrl === 'string'
  )
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
