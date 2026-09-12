import {
  isPresentationDocument,
  type PresentationDocument,
} from '../model/presentation'

const DATABASE_NAME = 'web-slide-editor'
const DATABASE_VERSION = 1
const PRESENTATIONS_STORE = 'presentations'
const ASSETS_STORE = 'assets'
const ACTIVE_PRESENTATION_ID = 'active'

interface StoredPresentation {
  id: string
  document: PresentationDocument
  updatedAt: string
}

export interface AssetRecord {
  id: string
  blob: Blob
  mimeType: 'image/png' | 'image/jpeg'
  fileName: string
  width: number
  height: number
  createdAt: string
}

let databasePromise: Promise<IDBDatabase> | undefined

export async function loadPresentation(): Promise<PresentationDocument | null> {
  const database = await openDatabase()
  const transaction = database.transaction(PRESENTATIONS_STORE, 'readonly')
  const completion = transactionComplete(transaction)
  const record = await requestAsPromise<StoredPresentation | undefined>(
    transaction.objectStore(PRESENTATIONS_STORE).get(ACTIVE_PRESENTATION_ID),
  )
  await completion

  if (!record) return null
  if (!isPresentationDocument(record.document)) {
    throw new Error('The saved presentation uses an invalid document format.')
  }
  return record.document
}

export async function savePresentation(
  document: PresentationDocument,
): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(PRESENTATIONS_STORE, 'readwrite')
  const completion = transactionComplete(transaction)
  transaction.objectStore(PRESENTATIONS_STORE).put({
    id: ACTIVE_PRESENTATION_ID,
    document,
    updatedAt: new Date().toISOString(),
  } satisfies StoredPresentation)
  await completion
}

export async function saveAsset(asset: AssetRecord): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(ASSETS_STORE, 'readwrite')
  const completion = transactionComplete(transaction)
  transaction.objectStore(ASSETS_STORE).put(asset)
  await completion
}

export async function saveProject(
  document: PresentationDocument,
  assets: AssetRecord[],
): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(
    [PRESENTATIONS_STORE, ASSETS_STORE],
    'readwrite',
  )
  const completion = transactionComplete(transaction)
  transaction.objectStore(PRESENTATIONS_STORE).put({
    id: ACTIVE_PRESENTATION_ID,
    document,
    updatedAt: new Date().toISOString(),
  } satisfies StoredPresentation)
  const assetStore = transaction.objectStore(ASSETS_STORE)
  assets.forEach((asset) => assetStore.put(asset))
  await completion
}

export async function loadAsset(id: string): Promise<AssetRecord | null> {
  const database = await openDatabase()
  const transaction = database.transaction(ASSETS_STORE, 'readonly')
  const completion = transactionComplete(transaction)
  const record = await requestAsPromise<AssetRecord | undefined>(
    transaction.objectStore(ASSETS_STORE).get(id),
  )
  await completion
  return record ?? null
}

export async function deletePresentationDatabase(): Promise<void> {
  if (databasePromise) {
    const database = await databasePromise.catch(() => undefined)
    database?.close()
    databasePromise = undefined
  }

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Database deletion was blocked.'))
  })
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(PRESENTATIONS_STORE)) {
        database.createObjectStore(PRESENTATIONS_STORE, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(ASSETS_STORE)) {
        database.createObjectStore(ASSETS_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      databasePromise = undefined
      reject(request.error)
    }
  })

  return databasePromise
}

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
    transaction.onerror = () => reject(transaction.error)
  })
}
