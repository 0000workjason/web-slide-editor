import {
  useEffect,
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { ImageElementView } from './components/ImageElementView'
import { PresentationMode } from './components/PresentationMode'
import { ShapeElementView } from './components/ShapeElementView'
import { SlideRenderer } from './components/SlideRenderer'
import { TextElementView } from './components/TextElementView'
import {
  readImageDimensions,
  validateImageFile,
} from './editor/imageImport'
import { useCanvasScale, type ZoomMode } from './editor/useCanvasScale'
import {
  type PresentationAction,
} from './editor/presentationReducer'
import {
  clampElementPosition,
  resizeElement,
  type Point,
} from './editor/coordinates'
import {
  alignElements,
  constrainAndSnapMove,
  distributeElements,
  type Alignment,
} from './editor/selectionLayout'
import { useDocumentHistory } from './editor/useDocumentHistory'
import {
  createImageElement,
  createShapeElement,
  createSlide,
  createTextElement,
  type FontFamily,
  type ImagePosition,
  type ShapeKind,
  type SlideElement,
  type TextAlign,
} from './model/presentation'
import { PrintDocument } from './print/PrintDocument'
import { preparePrint } from './print/preparePrint'
import {
  loadPresentation,
  saveAsset,
  savePresentation,
  saveProject,
} from './storage/presentationDb'
import {
  createProjectBackup,
  readProjectBackup,
} from './storage/projectBackup'

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25] as const
type StorageStatus = 'loading' | 'unsaved' | 'saving' | 'saved' | 'error'
type PrintStatus = 'idle' | 'preparing' | 'error'

const STORAGE_LABELS: Record<StorageStatus, string> = {
  loading: '正在載入本機內容',
  unsaved: '尚未儲存',
  saving: '正在儲存',
  saved: '已儲存在這台裝置',
  error: '本機儲存失敗',
}

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function isTextEntryTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

function duplicateElement(
  element: SlideElement,
  offset = 0,
  groupId?: string,
): SlideElement {
  const copy = {
    id: makeId(element.type),
    x: element.x + offset,
    y: element.y + offset,
    groupId,
  }
  if (element.type === 'text') {
    return {
      ...element,
      ...copy,
      style: { ...element.style },
    }
  }
  if (element.type === 'shape') {
    return { ...element, ...copy, style: { ...element.style } }
  }
  return { ...element, ...copy }
}

function duplicateElements(elements: SlideElement[], offset = 0) {
  const groupIds = new Map<string, string>()
  return elements.map((element) => {
    const groupId = element.groupId
      ? groupIds.get(element.groupId) ?? (() => {
          const id = makeId('group')
          groupIds.set(element.groupId!, id)
          return id
        })()
      : undefined
    return duplicateElement(element, offset, groupId)
  })
}

function projectFileName(name: string) {
  const safeName = name.trim().replace(/[<>:"/\\|?*\p{Cc}]/gu, '_')
  return `${safeName || 'presentation'}.slide-project.json`
}

interface InspectorNumberFieldProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  disabled?: boolean
  onCommit: (value: number) => void
}

function InspectorNumberField({
  label,
  value,
  min,
  max,
  step = 1,
  disabled = false,
  onCommit,
}: InspectorNumberFieldProps) {
  return (
    <label>
      <span>{label}</span>
      <input
        key={value}
        type="number"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        defaultValue={step === 1 ? Math.round(value) : value}
        onBlur={(event) => {
          const next = Number(event.currentTarget.value)
          if (Number.isFinite(next) && next >= min && next <= max) {
            onCommit(step === 1 ? Math.round(next) : next)
          } else {
            event.currentTarget.value = String(step === 1 ? Math.round(value) : value)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
    </label>
  )
}

export default function App() {
  const {
    document: presentation,
    canUndo,
    canRedo,
    commit,
    replace,
    undo,
    redo,
  } = useDocumentHistory()
  const [activeSlideId, setActiveSlideId] = useState('slide-1')
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([])
  const [editingElementId, setEditingElementId] = useState<string | null>(null)
  const [dragPreview, setDragPreview] = useState<{
    sourceId: string
    elementIds: string[]
    delta: Point
  } | null>(null)
  const [snapGuides, setSnapGuides] = useState<{ x?: number; y?: number }>({})
  const [marquee, setMarquee] = useState<{
    pointerId: number
    start: Point
    current: Point
    additive: boolean
  } | null>(null)
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit')
  const [hydrated, setHydrated] = useState(false)
  const [storageStatus, setStorageStatus] = useState<StorageStatus>('loading')
  const [importError, setImportError] = useState<string | null>(null)
  const [projectError, setProjectError] = useState<string | null>(null)
  const [projectBusy, setProjectBusy] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const [printStatus, setPrintStatus] = useState<PrintStatus>('idle')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const replaceImageInputRef = useRef<HTMLInputElement>(null)
  const projectInputRef = useRef<HTMLInputElement>(null)
  const clipboardRef = useRef<SlideElement[]>([])
  const saveRevisionRef = useRef(0)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())

  const resolvedActiveSlideId = presentation.slides[activeSlideId]
    ? activeSlideId
    : presentation.slideOrder[0]
  const activeSlide = presentation.slides[resolvedActiveSlideId]
  const selectedElements = activeSlide.elements.filter(
    (element) => selectedElementIds.includes(element.id),
  )
  const selectedElement = selectedElements.length === 1
    ? selectedElements[0]
    : undefined
  const selectionHasPositionLock = selectedElements.some(
    (element) => element.positionLocked,
  )
  const visibleSlideOrder = presentation.slideOrder.filter(
    (slideId) => !presentation.slides[slideId].hidden,
  )
  const outputPresentation = {
    ...presentation,
    slideOrder: visibleSlideOrder,
  }
  const outputInitialSlideId = visibleSlideOrder.includes(resolvedActiveSlideId)
    ? resolvedActiveSlideId
    : visibleSlideOrder[0]
  const canDeleteActiveSlide = presentation.slideOrder.length > 1 && (
    activeSlide.hidden || visibleSlideOrder.length > 1
  )
  const toolbarError = projectError ?? importError ?? (
    printStatus === 'error' ? '列印準備失敗，請確認圖片是否能正常顯示。' : null
  )
  const { viewportRef, scale } = useCanvasScale(
    presentation.canvas.width,
    presentation.canvas.height,
    zoomMode,
  )
  const updateDocument = useCallback((action: PresentationAction) => {
    setStorageStatus('unsaved')
    commit(action)
  }, [commit])

  const undoDocument = useCallback(() => {
    if (!canUndo) return
    setStorageStatus('unsaved')
    setSelectedElementIds([])
    setEditingElementId(null)
    undo()
  }, [canUndo, undo])

  const redoDocument = useCallback(() => {
    if (!canRedo) return
    setStorageStatus('unsaved')
    setSelectedElementIds([])
    setEditingElementId(null)
    redo()
  }, [canRedo, redo])

  useEffect(() => {
    let active = true

    void loadPresentation()
      .then((savedDocument) => {
        if (!active) return
        if (savedDocument) {
          replace(savedDocument)
          setActiveSlideId(savedDocument.slideOrder[0])
        }
        setStorageStatus(savedDocument ? 'saved' : 'unsaved')
        setHydrated(true)
      })
      .catch(() => {
        if (!active) return
        setStorageStatus('error')
        setHydrated(true)
      })

    return () => {
      active = false
    }
  }, [replace])

  useEffect(() => {
    if (!hydrated) return

    const timeout = window.setTimeout(() => {
      const revision = ++saveRevisionRef.current
      setStorageStatus('saving')
      const queuedSave = saveQueueRef.current
        .catch(() => undefined)
        .then(() => savePresentation(presentation))
      saveQueueRef.current = queuedSave.catch(() => undefined)
      void queuedSave
        .then(() => {
          if (saveRevisionRef.current === revision) setStorageStatus('saved')
        })
        .catch(() => {
          if (saveRevisionRef.current === revision) setStorageStatus('error')
        })
    }, 400)

    return () => window.clearTimeout(timeout)
  }, [hydrated, presentation])

  const addText = () => {
    const element = createTextElement(
      makeId('text'),
      activeSlide.elements.length,
    )
    updateDocument({ type: 'element/add', slideId: resolvedActiveSlideId, element })
    setSelectedElementIds([element.id])
    setEditingElementId(element.id)
  }

  const addSlide = () => {
    const slide = createSlide(makeId('slide'))
    updateDocument({ type: 'slide/add', slide })
    setActiveSlideId(slide.id)
    setSelectedElementIds([])
    setEditingElementId(null)
  }

  const selectSlide = (slideId: string) => {
    setActiveSlideId(slideId)
    setSelectedElementIds([])
    setEditingElementId(null)
  }

  const duplicateActiveSlide = () => {
    const slide = {
      ...activeSlide,
      id: makeId('slide'),
      elements: duplicateElements(activeSlide.elements),
    }
    updateDocument({
      type: 'slide/add',
      slide,
      afterSlideId: resolvedActiveSlideId,
    })
    setActiveSlideId(slide.id)
    setSelectedElementIds([])
    setEditingElementId(null)
  }

  const deleteActiveSlide = () => {
    if (!canDeleteActiveSlide) return

    const currentIndex = presentation.slideOrder.indexOf(resolvedActiveSlideId)
    const nextSlideId = presentation.slideOrder[currentIndex + 1]
      ?? presentation.slideOrder[currentIndex - 1]
    updateDocument({ type: 'slide/delete', slideId: resolvedActiveSlideId })
    setActiveSlideId(nextSlideId)
    setSelectedElementIds([])
    setEditingElementId(null)
  }

  const moveActiveSlide = (direction: -1 | 1) => {
    const currentIndex = presentation.slideOrder.indexOf(resolvedActiveSlideId)
    updateDocument({
      type: 'slide/move',
      slideId: resolvedActiveSlideId,
      toIndex: currentIndex + direction,
    })
  }

  const selectElement = (element: SlideElement, additive: boolean) => {
    const targets = element.groupId
      ? activeSlide.elements
          .filter((candidate) => candidate.groupId === element.groupId)
          .map((candidate) => candidate.id)
      : [element.id]
    setEditingElementId(null)
    setSelectedElementIds((current) => {
      if (!additive) {
        return current.includes(element.id) && current.length > 1
          ? current
          : targets
      }
      const removing = targets.every((id) => current.includes(id))
      return removing
        ? current.filter((id) => !targets.includes(id))
        : [...new Set([...current, ...targets])]
    })
  }

  const addShape = (shape: ShapeKind) => {
    const element = createShapeElement(
      makeId('shape'),
      shape,
      activeSlide.elements.length,
    )
    updateDocument({ type: 'element/add', slideId: resolvedActiveSlideId, element })
    setSelectedElementIds([element.id])
    setEditingElementId(null)
  }

  const addElements = (elements: SlideElement[]) => {
    if (elements.length === 0) return
    updateDocument({
      type: 'element/add-many',
      slideId: resolvedActiveSlideId,
      elements,
    })
    setSelectedElementIds(elements.map((element) => element.id))
    setEditingElementId(null)
  }

  const duplicateSelection = () => {
    const duplicated = duplicateElements(selectedElements, 24).map((element) => {
      const position = clampElementPosition(element, element, presentation.canvas)
      return { ...element, ...position }
    })
    addElements(duplicated)
  }

  const copySelection = () => {
    clipboardRef.current = structuredClone(selectedElements)
  }

  const cutSelection = () => {
    copySelection()
    deleteSelection()
  }

  const pasteSelection = () => {
    const duplicated = duplicateElements(clipboardRef.current, 24).map((element) => {
      const position = clampElementPosition(element, element, presentation.canvas)
      return { ...element, ...position }
    })
    addElements(duplicated)
    if (duplicated.length > 0) clipboardRef.current = structuredClone(duplicated)
  }

  const deleteSelection = () => {
    if (selectedElementIds.length === 0) return
    updateDocument({
      type: 'element/delete-many',
      slideId: resolvedActiveSlideId,
      elementIds: selectedElementIds,
    })
    setSelectedElementIds([])
  }

  const groupSelection = () => {
    if (selectedElementIds.length < 2) return
    updateDocument({
      type: 'element/set-group',
      slideId: resolvedActiveSlideId,
      elementIds: selectedElementIds,
      groupId: makeId('group'),
    })
  }

  const ungroupSelection = () => {
    if (!selectedElements.some((element) => element.groupId)) return
    const groupIds = new Set(selectedElements.flatMap((element) =>
      element.groupId ? [element.groupId] : [],
    ))
    const elementIds = activeSlide.elements.flatMap((element) =>
      element.groupId && groupIds.has(element.groupId) ? [element.id] : [],
    )
    updateDocument({
      type: 'element/set-group',
      slideId: resolvedActiveSlideId,
      elementIds,
    })
  }

  const moveSelection = (rawDelta: Point) => {
    if (selectedElements.length === 0 || selectionHasPositionLock) return
    const { delta } = constrainAndSnapMove(
      selectedElements,
      [],
      rawDelta,
      presentation.canvas,
      -1,
    )
    if (delta.x === 0 && delta.y === 0) return
    updateDocument({
      type: 'element/translate',
      slideId: resolvedActiveSlideId,
      elementIds: selectedElementIds,
      x: delta.x,
      y: delta.y,
    })
  }

  const reorderSelection = (
    direction: 'front' | 'forward' | 'backward' | 'back',
  ) => {
    if (selectedElementIds.length === 0) return
    updateDocument({
      type: 'element/reorder',
      slideId: resolvedActiveSlideId,
      elementIds: selectedElementIds,
      direction,
    })
  }

  const alignSelection = (alignment: Alignment) => {
    if (selectionHasPositionLock) return
    const frames = alignElements(selectedElements, alignment, presentation.canvas)
    updateDocument({
      type: 'element/set-frames',
      slideId: resolvedActiveSlideId,
      frames,
    })
  }

  const distributeSelection = (axis: 'horizontal' | 'vertical') => {
    if (selectionHasPositionLock) return
    const frames = distributeElements(selectedElements, axis)
    updateDocument({
      type: 'element/set-frames',
      slideId: resolvedActiveSlideId,
      frames,
    })
  }

  const applyLayout = (layout: 'title' | 'content' | 'columns') => {
    if (activeSlide.elements.length > 0) return
    const makeText = (
      text: string,
      frame: { x: number; y: number; width: number; height: number },
      fontSize: number,
      textAlign: TextAlign = 'left',
    ) => ({
      ...createTextElement(makeId('text')),
      ...frame,
      text,
      style: { fontSize, color: '#172039', textAlign },
    })
    const elements = layout === 'title'
      ? [
          makeText('簡報標題', { x: 240, y: 260, width: 1120, height: 130 }, 64, 'center'),
          makeText('副標題', { x: 360, y: 430, width: 880, height: 90 }, 32, 'center'),
        ]
      : layout === 'content'
        ? [
            makeText('投影片標題', { x: 140, y: 90, width: 1320, height: 100 }, 52),
            makeText('輸入內容', { x: 140, y: 250, width: 1320, height: 500 }, 32),
          ]
        : [
            makeText('投影片標題', { x: 140, y: 90, width: 1320, height: 100 }, 52),
            makeText('左欄內容', { x: 140, y: 250, width: 620, height: 500 }, 30),
            makeText('右欄內容', { x: 840, y: 250, width: 620, height: 500 }, 30),
          ]
    addElements(elements)
  }

  const movingElements = (source: SlideElement) =>
    selectedElementIds.includes(source.id) ? selectedElements : [source]

  const transformMove = (source: SlideElement, rawDelta: Point) => {
    const moving = movingElements(source)
    const movingIds = new Set(moving.map((element) => element.id))
    const result = constrainAndSnapMove(
      moving,
      activeSlide.elements.filter((element) => !movingIds.has(element.id)),
      rawDelta,
      presentation.canvas,
    )
    setSnapGuides(result.guides)
    return result.delta
  }

  const previewMove = (source: SlideElement, delta: Point) => {
    setDragPreview({
      sourceId: source.id,
      elementIds: movingElements(source).map((element) => element.id),
      delta,
    })
  }

  const commitMove = (source: SlideElement, point: Point, delta: Point) => {
    const elementIds = dragPreview?.sourceId === source.id
      ? dragPreview.elementIds
      : movingElements(source).map((element) => element.id)
    if (elementIds.length > 1) {
      updateDocument({
        type: 'element/translate',
        slideId: resolvedActiveSlideId,
        elementIds,
        x: delta.x,
        y: delta.y,
      })
    } else {
      updateDocument({
        type: 'element/move',
        slideId: resolvedActiveSlideId,
        elementId: source.id,
        x: point.x,
        y: point.y,
      })
    }
    setDragPreview(null)
    setSnapGuides({})
  }

  const cancelMove = () => {
    setDragPreview(null)
    setSnapGuides({})
  }

  const canvasPoint = (event: ReactPointerEvent<HTMLDivElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(presentation.canvas.width,
        (event.clientX - bounds.left) / scale)),
      y: Math.max(0, Math.min(presentation.canvas.height,
        (event.clientY - bounds.top) / scale)),
    }
  }

  const startMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.button !== 0) return
    const point = canvasPoint(event)
    const additive = event.ctrlKey || event.metaKey || event.shiftKey
    if (!additive) setSelectedElementIds([])
    setEditingElementId(null)
    event.currentTarget.setPointerCapture(event.pointerId)
    setMarquee({
      pointerId: event.pointerId,
      start: point,
      current: point,
      additive,
    })
  }

  const moveMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (marquee?.pointerId !== event.pointerId) return
    setMarquee({ ...marquee, current: canvasPoint(event) })
  }

  const finishMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (marquee?.pointerId !== event.pointerId) return
    const current = canvasPoint(event)
    const bounds = {
      left: Math.min(marquee.start.x, current.x),
      top: Math.min(marquee.start.y, current.y),
      right: Math.max(marquee.start.x, current.x),
      bottom: Math.max(marquee.start.y, current.y),
    }
    const hitElements = activeSlide.elements.filter((element) =>
      element.x < bounds.right &&
      element.x + element.width > bounds.left &&
      element.y < bounds.bottom &&
      element.y + element.height > bounds.top,
    )
    const groupIds = new Set(hitElements.flatMap((element) =>
      element.groupId ? [element.groupId] : [],
    ))
    const hitIds = activeSlide.elements.flatMap((element) =>
      hitElements.includes(element) ||
      (element.groupId && groupIds.has(element.groupId))
        ? [element.id]
        : [],
    )
    setSelectedElementIds((selected) => marquee.additive
      ? [...new Set([...selected, ...hitIds])]
      : hitIds)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setMarquee(null)
  }

  const cancelMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (marquee?.pointerId === event.pointerId) setMarquee(null)
  }

  const elementInteractionProps = (element: SlideElement) => ({
    canvasSize: presentation.canvas,
    scale,
    selected: selectedElementIds.includes(element.id),
    showResizeHandle:
      selectedElementIds.length === 1 &&
      selectedElementIds[0] === element.id &&
      !element.positionLocked,
    positionLocked: movingElements(element).some(
      (candidate) => candidate.positionLocked,
    ),
    previewOffset:
      dragPreview &&
      dragPreview.sourceId !== element.id &&
      dragPreview.elementIds.includes(element.id)
        ? dragPreview.delta
        : undefined,
    onSelect: (additive: boolean) => selectElement(element, additive),
    transformMoveDelta: (delta: Point) => transformMove(element, delta),
    onMovePreview: (delta: Point) => previewMove(element, delta),
    onMoveCommit: (point: Point, delta: Point) => commitMove(element, point, delta),
    onMoveCancel: cancelMove,
    onResizeCommit: ({ width, height }: { width: number; height: number }) =>
      updateDocument({
        type: 'element/set-frame',
        slideId: resolvedActiveSlideId,
        elementId: element.id,
        frame: { x: element.x, y: element.y, width, height },
      }),
  })

  const importImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const validationError = validateImageFile(file)
    setImportError(validationError)
    if (validationError) return

    try {
      setStorageStatus('saving')
      const dimensions = await readImageDimensions(file)
      const assetId = makeId('asset')
      const element = createImageElement(
        makeId('image'),
        assetId,
        file.name,
        dimensions,
      )
      await saveAsset({
        id: assetId,
        blob: file,
        mimeType: file.type as 'image/png' | 'image/jpeg',
        fileName: file.name,
        ...dimensions,
        createdAt: new Date().toISOString(),
      })
      updateDocument({ type: 'element/add', slideId: resolvedActiveSlideId, element })
      setSelectedElementIds([element.id])
      setEditingElementId(null)
      setImportError(null)
    } catch {
      setStorageStatus('error')
      setImportError('圖片無法讀取或寫入本機儲存空間。')
    }
  }

  const replaceImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || selectedElement?.type !== 'image') return

    const validationError = validateImageFile(file)
    setImportError(validationError)
    if (validationError) return

    try {
      setStorageStatus('saving')
      const dimensions = await readImageDimensions(file)
      const assetId = makeId('asset')
      await saveAsset({
        id: assetId,
        blob: file,
        mimeType: file.type as 'image/png' | 'image/jpeg',
        fileName: file.name,
        ...dimensions,
        createdAt: new Date().toISOString(),
      })
      updateDocument({
        type: 'element/set-image',
        slideId: resolvedActiveSlideId,
        elementId: selectedElement.id,
        image: { assetId, alt: file.name },
      })
      setImportError(null)
    } catch {
      setStorageStatus('error')
      setImportError('圖片無法讀取或寫入本機儲存空間。')
    }
  }

  const downloadProject = async () => {
    setProjectBusy(true)
    setProjectError(null)
    try {
      const source = await createProjectBackup(presentation)
      const url = URL.createObjectURL(new Blob([source], {
        type: 'application/json',
      }))
      const link = document.createElement('a')
      link.href = url
      link.download = projectFileName(presentation.name)
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch {
      setProjectError('專案備份無法建立，請確認所有圖片都能載入。')
    } finally {
      setProjectBusy(false)
    }
  }

  const importProject = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setProjectBusy(true)
    setProjectError(null)
    try {
      const project = await readProjectBackup(file)
      const queuedSave = saveQueueRef.current
        .catch(() => undefined)
        .then(() => saveProject(project.document, project.assets))
      saveQueueRef.current = queuedSave.catch(() => undefined)
      await queuedSave
      replace(project.document)
      setActiveSlideId(project.document.slideOrder[0])
      setSelectedElementIds([])
      setEditingElementId(null)
      setStorageStatus('saved')
    } catch {
      setProjectError('專案檔無法匯入，原本的簡報沒有變更。')
    } finally {
      setProjectBusy(false)
    }
  }

  const changeZoom = (direction: -1 | 1) => {
    const current = zoomMode === 'fit' ? scale : zoomMode
    const candidates = direction > 0 ? ZOOM_STEPS : [...ZOOM_STEPS].reverse()
    const next = candidates.find((step) =>
      direction > 0 ? step > current + 0.01 : step < current - 0.01,
    )
    if (next) setZoomMode(next)
  }

  const setSelectedFrameValue = (
    property: 'x' | 'y' | 'width' | 'height',
    value: number,
  ) => {
    if (!selectedElement || selectedElement.positionLocked) return

    let position = { x: selectedElement.x, y: selectedElement.y }
    let size = { width: selectedElement.width, height: selectedElement.height }
    if (property === 'x' || property === 'y') {
      position = clampElementPosition(
        { ...position, [property]: value },
        size,
        presentation.canvas,
      )
    } else {
      size = resizeElement(
        position,
        size,
        {
          x: property === 'width' ? value - size.width : 0,
          y: property === 'height' ? value - size.height : 0,
        },
        presentation.canvas,
        selectedElement.type === 'image',
      )
    }

    updateDocument({
      type: 'element/set-frame',
      slideId: resolvedActiveSlideId,
      elementId: selectedElement.id,
      frame: { ...position, ...size },
    })
  }

  const setSelectedTextStyle = (
    style: Partial<{
      fontSize: number
      color: string
      textAlign: TextAlign
      fontFamily: FontFamily
      fontWeight: 'normal' | 'bold'
      fontStyle: 'normal' | 'italic'
      lineHeight: number
    }>,
  ) => {
    if (selectedElement?.type !== 'text') return
    updateDocument({
      type: 'element/set-style',
      slideId: resolvedActiveSlideId,
      elementId: selectedElement.id,
      style,
    })
  }

  const setSelectedOpacity = (percentage: number) => {
    if (!selectedElement) return
    updateDocument({
      type: 'element/set-opacity',
      slideId: resolvedActiveSlideId,
      elementId: selectedElement.id,
      opacity: percentage / 100,
    })
  }

  const toggleSelectionPositionLock = () => {
    if (selectedElementIds.length === 0) return
    updateDocument({
      type: 'element/set-position-lock',
      slideId: resolvedActiveSlideId,
      elementIds: selectedElementIds,
      locked: !selectedElements.every((element) => element.positionLocked),
    })
  }

  const toggleActiveSlideHidden = () => {
    updateDocument({
      type: 'slide/set-hidden',
      slideId: resolvedActiveSlideId,
      hidden: !activeSlide.hidden,
    })
  }

  const setSelectedImage = (
    image: Partial<{ fit: 'contain' | 'cover'; position: ImagePosition }>,
  ) => {
    if (selectedElement?.type !== 'image') return
    updateDocument({
      type: 'element/set-image',
      slideId: resolvedActiveSlideId,
      elementId: selectedElement.id,
      image,
    })
  }

  const setSelectedShape = (
    shape: Partial<{
      shape: ShapeKind
      style: { fill: string; stroke: string; strokeWidth: number }
    }>,
  ) => {
    if (selectedElement?.type !== 'shape') return
    updateDocument({
      type: 'element/set-shape',
      slideId: resolvedActiveSlideId,
      elementId: selectedElement.id,
      shape,
    })
  }

  const printPresentation = async () => {
    const printRoot = document.querySelector('.print-document')
    if (!printRoot) return

    setPrintStatus('preparing')
    try {
      await preparePrint(printRoot)
      window.print()
      setPrintStatus('idle')
    } catch {
      setPrintStatus('error')
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        presenting ||
        event.isComposing ||
        editingElementId ||
        isTextEntryTarget(event.target)
      ) return

      const modifier = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      if (modifier && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redoDocument()
        else undoDocument()
        return
      }
      if (modifier && key === 'y') {
        event.preventDefault()
        redoDocument()
        return
      }
      if (modifier && key === 'a') {
        event.preventDefault()
        setSelectedElementIds(activeSlide.elements.map((element) => element.id))
        return
      }
      if (modifier && key === 'c') {
        event.preventDefault()
        copySelection()
        return
      }
      if (modifier && key === 'x') {
        event.preventDefault()
        cutSelection()
        return
      }
      if (modifier && key === 'v') {
        event.preventDefault()
        pasteSelection()
        return
      }
      if (modifier && key === 'd') {
        event.preventDefault()
        duplicateSelection()
        return
      }
      if (modifier && key === 'g') {
        event.preventDefault()
        if (event.shiftKey) ungroupSelection()
        else groupSelection()
        return
      }
      if (modifier && (event.key === ']' || event.key === '[')) {
        event.preventDefault()
        reorderSelection(event.key === ']' ? 'forward' : 'backward')
        return
      }

      if (event.key === 'Escape') {
        setSelectedElementIds([])
        return
      }
      if (event.key === 'Enter' && selectedElement?.type === 'text') {
        setEditingElementId(selectedElement.id)
        return
      }
      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        selectedElementIds.length > 0
      ) {
        event.preventDefault()
        deleteSelection()
        return
      }
      if (event.key.startsWith('Arrow') && selectedElementIds.length > 0) {
        event.preventDefault()
        const distance = event.shiftKey ? 10 : 1
        moveSelection({
          x: event.key === 'ArrowLeft' ? -distance
            : event.key === 'ArrowRight' ? distance : 0,
          y: event.key === 'ArrowUp' ? -distance
            : event.key === 'ArrowDown' ? distance : 0,
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  return (
    <>
      <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">S</span>
          <div>
            <p className="brand__eyebrow">WEB SLIDE LAB</p>
            <input
              className="presentation-name"
              aria-label="簡報名稱"
              maxLength={80}
              value={presentation.name}
              onChange={(event) => updateDocument({
                type: 'document/set-name',
                name: event.currentTarget.value,
              })}
            />
          </div>
        </div>

        <div className={`header-status is-${storageStatus}`} role="status">
          <span className="header-status__dot" />
          {STORAGE_LABELS[storageStatus]}
        </div>
      </header>

      <section className="toolbar" aria-label="編輯工具列">
        <button
          className="primary-action"
          type="button"
          onClick={addText}
          disabled={!hydrated}
        >
          <span aria-hidden="true">＋</span>
          新增文字
        </button>
        <button
          className="secondary-action"
          type="button"
          disabled={!hydrated}
          onClick={() => fileInputRef.current?.click()}
        >
          <span aria-hidden="true">▧</span>
          匯入圖片
        </button>
        <select
          className="toolbar-select"
          aria-label="新增圖形"
          value=""
          disabled={!hydrated}
          onChange={(event) => {
            if (event.currentTarget.value) {
              addShape(event.currentTarget.value as ShapeKind)
            }
          }}
        >
          <option value="">新增圖形</option>
          <option value="rectangle">矩形</option>
          <option value="ellipse">圓形</option>
          <option value="line">直線</option>
          <option value="arrow">箭頭</option>
        </select>
        <div className="history-controls" aria-label="復原與重做">
          <button
            type="button"
            aria-label="復原"
            title="復原（Ctrl+Z）"
            disabled={!canUndo}
            onClick={undoDocument}
          >
            ↶
          </button>
          <button
            type="button"
            aria-label="重做"
            title="重做（Ctrl+Y）"
            disabled={!canRedo}
            onClick={redoDocument}
          >
            ↷
          </button>
        </div>
        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept="image/png,image/jpeg"
          aria-label="選擇 PNG 或 JPEG 圖片"
          onChange={importImage}
        />
        <input
          ref={replaceImageInputRef}
          className="visually-hidden"
          type="file"
          accept="image/png,image/jpeg"
          aria-label="選擇替換圖片"
          onChange={replaceImage}
        />
        <button
          className="secondary-action"
          type="button"
          disabled={!hydrated || projectBusy}
          onClick={() => void downloadProject()}
        >
          下載備份
        </button>
        <button
          className="secondary-action"
          type="button"
          disabled={!hydrated || projectBusy}
          onClick={() => projectInputRef.current?.click()}
        >
          匯入備份
        </button>
        <input
          ref={projectInputRef}
          className="visually-hidden"
          type="file"
          accept=".json,application/json"
          aria-label="選擇簡報專案備份"
          onChange={importProject}
        />
        <button
          className="secondary-action"
          type="button"
          disabled={!hydrated || printStatus === 'preparing'}
          onClick={() => void printPresentation()}
        >
          <span aria-hidden="true">⇩</span>
          {printStatus === 'preparing' ? '準備列印' : '輸出 PDF'}
        </button>
        <button
          className="secondary-action"
          type="button"
          disabled={!hydrated}
          onClick={() => {
            setSelectedElementIds([])
            setEditingElementId(null)
            setPresenting(true)
          }}
        >
          播放
        </button>
        <span className={`toolbar__hint${toolbarError ? ' is-error' : ''}`}>
          {toolbarError ?? '內容會自動儲存在這台裝置'}
        </span>
        <div className="zoom-controls" aria-label="畫布縮放">
          <button
            type="button"
            aria-label="縮小畫布"
            onClick={() => changeZoom(-1)}
          >
            −
          </button>
          <button
            className="zoom-value"
            type="button"
            onClick={() => setZoomMode('fit')}
          >
            {zoomMode === 'fit' ? '符合視窗' : `${Math.round(scale * 100)}%`}
          </button>
          <button
            type="button"
            aria-label="放大畫布"
            onClick={() => changeZoom(1)}
          >
            ＋
          </button>
        </div>
      </section>

      <section className="workspace">
        <aside className="slide-rail" aria-label="投影片清單">
          <p className="slide-rail__label">投影片</p>
          {presentation.slideOrder.map((slideId, index) => (
            <button
              key={slideId}
              className={`slide-thumbnail${slideId === resolvedActiveSlideId ? ' is-active' : ''}${presentation.slides[slideId].hidden ? ' is-hidden' : ''}`}
              type="button"
              aria-label={`投影片 ${index + 1}${presentation.slides[slideId].hidden ? '，已略過' : ''}`}
              aria-current={slideId === resolvedActiveSlideId ? 'page' : undefined}
              onClick={() => selectSlide(slideId)}
            >
              <span className="slide-thumbnail__number">{index + 1}</span>
              <span className="slide-thumbnail__page" aria-hidden="true">
                <SlideRenderer
                  className="slide-thumbnail__preview"
                  slide={presentation.slides[slideId]}
                  canvas={presentation.canvas}
                />
              </span>
            </button>
          ))}
          <div className="slide-actions" aria-label="目前投影片操作">
            <button
              type="button"
              aria-label="複製目前投影片"
              title="複製投影片"
              disabled={!hydrated}
              onClick={duplicateActiveSlide}
            >
              ⧉
            </button>
            <button
              type="button"
              aria-label="將目前投影片往前移"
              title="往前移"
              disabled={presentation.slideOrder[0] === resolvedActiveSlideId}
              onClick={() => moveActiveSlide(-1)}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label="將目前投影片往後移"
              title="往後移"
              disabled={
                presentation.slideOrder[presentation.slideOrder.length - 1]
                  === resolvedActiveSlideId
              }
              onClick={() => moveActiveSlide(1)}
            >
              ↓
            </button>
            <button
              type="button"
              aria-label={activeSlide.hidden ? '取消略過目前投影片' : '播放與 PDF 略過目前投影片'}
              title={activeSlide.hidden ? '取消略過' : '略過投影片'}
              disabled={!activeSlide.hidden && visibleSlideOrder.length === 1}
              onClick={toggleActiveSlideHidden}
            >
              {activeSlide.hidden ? '●' : '○'}
            </button>
            <button
              type="button"
              aria-label="刪除目前投影片"
              title="刪除投影片"
              disabled={!canDeleteActiveSlide}
              onClick={deleteActiveSlide}
            >
              ×
            </button>
          </div>
          <button
            className="add-slide-button"
            type="button"
            aria-label="新增投影片"
            disabled={!hydrated}
            onClick={addSlide}
          >
            ＋ 新增投影片
          </button>
          <p className="slide-rail__note">播放與 PDF 會略過已標記的投影片</p>
        </aside>

        <div
          ref={viewportRef}
          className="canvas-viewport"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedElementIds([])
              setEditingElementId(null)
            }
          }}
        >
          <div
            className="canvas-stage"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) {
                setSelectedElementIds([])
                setEditingElementId(null)
              }
            }}
          >
            <div
              className="canvas-frame"
              style={{
                width: presentation.canvas.width * scale,
                height: presentation.canvas.height * scale,
              }}
            >
              <SlideRenderer
                className="slide-canvas"
                aria-label="投影片畫布"
                slide={activeSlide}
                canvas={presentation.canvas}
                style={{
                  transform: `scale(${scale})`,
                }}
                onPointerDown={startMarquee}
                onPointerMove={moveMarquee}
                onPointerUp={finishMarquee}
                onPointerCancel={cancelMarquee}
              >
                {marquee && (
                  <span
                    className="selection-marquee"
                    style={{
                      left: Math.min(marquee.start.x, marquee.current.x),
                      top: Math.min(marquee.start.y, marquee.current.y),
                      width: Math.abs(marquee.current.x - marquee.start.x),
                      height: Math.abs(marquee.current.y - marquee.start.y),
                    }}
                  />
                )}
                {snapGuides.x !== undefined && (
                  <span className="snap-guide is-vertical" style={{ left: snapGuides.x }} />
                )}
                {snapGuides.y !== undefined && (
                  <span className="snap-guide is-horizontal" style={{ top: snapGuides.y }} />
                )}
                {activeSlide.elements.map((element) => {
                  if (element.type === 'text') {
                    return (
                      <TextElementView
                        key={element.id}
                        element={element}
                        {...elementInteractionProps(element)}
                        editing={editingElementId === element.id}
                        onStartEditing={() => {
                          setSelectedElementIds([element.id])
                          setEditingElementId(element.id)
                        }}
                        onStopEditing={() => setEditingElementId(null)}
                        onTextChange={(text) => updateDocument({
                          type: 'element/set-text',
                          slideId: resolvedActiveSlideId,
                          elementId: element.id,
                          text,
                        })}
                      />
                    )
                  }
                  if (element.type === 'image') {
                    return (
                      <ImageElementView
                        key={element.id}
                        element={element}
                        {...elementInteractionProps(element)}
                      />
                    )
                  }
                  return (
                    <ShapeElementView
                      key={element.id}
                      element={element}
                      {...elementInteractionProps(element)}
                    />
                  )
                })}
              </SlideRenderer>
            </div>
          </div>
        </div>

        <aside className="inspector" aria-label="物件資訊">
          <p className="inspector__label">目前狀態</p>
          <div className="inspector-card">
            <span className="inspector-card__icon" aria-hidden="true">
              {selectedElements.length > 1
                ? selectedElements.length
                : selectedElement?.type === 'image'
                  ? 'I'
                  : selectedElement?.type === 'shape' ? 'S' : 'T'}
            </span>
            <div>
              <strong>
                {editingElementId
                  ? '正在編輯文字'
                  : selectedElements.length > 1
                    ? `已選取 ${selectedElements.length} 個物件`
                  : selectedElement?.type === 'image'
                    ? '已選取圖片'
                    : selectedElement?.type === 'shape'
                      ? '已選取圖形'
                    : selectedElement
                      ? '已選取文字框'
                      : '未選取物件'}
              </strong>
              <p>
                {selectedElements.length > 0
                  ? 'Shift 點選可多選；拖曳可一起移動。'
                  : '點選物件，或用 Shift 點選多個物件。'}
              </p>
            </div>
          </div>
          {selectedElements.length > 0 && (
            <div className="inspector-fields">
              <p className="inspector-section-title">常用操作</p>
              <div className="inspector-buttons">
                <button type="button" onClick={copySelection}>複製</button>
                <button type="button" onClick={cutSelection}>剪下</button>
                <button type="button" onClick={duplicateSelection}>建立副本</button>
                <button type="button" onClick={toggleSelectionPositionLock}>
                  {selectedElements.every((element) => element.positionLocked)
                    ? '解除位置鎖定'
                    : '鎖定位置'}
                </button>
                <button
                  type="button"
                  disabled={selectedElements.length < 2}
                  onClick={groupSelection}
                >群組</button>
                <button
                  type="button"
                  disabled={!selectedElements.some((element) => element.groupId)}
                  onClick={ungroupSelection}
                >取消群組</button>
              </div>
              <p className="inspector-section-title">圖層</p>
              <div className="inspector-buttons four-columns">
                <button type="button" onClick={() => reorderSelection('back')}>置底</button>
                <button type="button" onClick={() => reorderSelection('backward')}>下移</button>
                <button type="button" onClick={() => reorderSelection('forward')}>上移</button>
                <button type="button" onClick={() => reorderSelection('front')}>置頂</button>
              </div>
              <p className="inspector-section-title">對齊與分布</p>
              <div className="inspector-buttons three-columns">
                <button disabled={selectionHasPositionLock} type="button" onClick={() => alignSelection('left')}>靠左</button>
                <button disabled={selectionHasPositionLock} type="button" onClick={() => alignSelection('center')}>水平中</button>
                <button disabled={selectionHasPositionLock} type="button" onClick={() => alignSelection('right')}>靠右</button>
                <button disabled={selectionHasPositionLock} type="button" onClick={() => alignSelection('top')}>靠上</button>
                <button disabled={selectionHasPositionLock} type="button" onClick={() => alignSelection('middle')}>垂直中</button>
                <button disabled={selectionHasPositionLock} type="button" onClick={() => alignSelection('bottom')}>靠下</button>
                <button
                  type="button"
                  disabled={selectedElements.length < 3 || selectionHasPositionLock}
                  onClick={() => distributeSelection('horizontal')}
                >水平分布</button>
                <button
                  type="button"
                  disabled={selectedElements.length < 3 || selectionHasPositionLock}
                  onClick={() => distributeSelection('vertical')}
                >垂直分布</button>
              </div>
            </div>
          )}
          {selectedElement && (
            <div className="inspector-fields">
              <p className="inspector-section-title">位置與大小</p>
              <div className="inspector-grid">
                <InspectorNumberField
                  label="X"
                  value={selectedElement.x}
                  min={0}
                  max={presentation.canvas.width - selectedElement.width}
                  disabled={selectedElement.positionLocked}
                  onCommit={(value) => setSelectedFrameValue('x', value)}
                />
                <InspectorNumberField
                  label="Y"
                  value={selectedElement.y}
                  min={0}
                  max={presentation.canvas.height - selectedElement.height}
                  disabled={selectedElement.positionLocked}
                  onCommit={(value) => setSelectedFrameValue('y', value)}
                />
                <InspectorNumberField
                  label="寬度"
                  value={selectedElement.width}
                  min={80}
                  max={presentation.canvas.width - selectedElement.x}
                  disabled={selectedElement.positionLocked}
                  onCommit={(value) => setSelectedFrameValue('width', value)}
                />
                <InspectorNumberField
                  label="高度"
                  value={selectedElement.height}
                  min={50}
                  max={presentation.canvas.height - selectedElement.y}
                  disabled={selectedElement.positionLocked}
                  onCommit={(value) => setSelectedFrameValue('height', value)}
                />
              </div>
              <p className="inspector-section-title">外觀</p>
              <div className="inspector-grid">
                <InspectorNumberField
                  label="不透明度 (%)"
                  value={Math.round((selectedElement.opacity ?? 1) * 100)}
                  min={0}
                  max={100}
                  onCommit={setSelectedOpacity}
                />
              </div>
              {selectedElement.type === 'text' && (
                <>
                  <p className="inspector-section-title">文字</p>
                  <div className="inspector-grid">
                    <InspectorNumberField
                      label="字級"
                      value={selectedElement.style.fontSize}
                      min={8}
                      max={200}
                      onCommit={(fontSize) => setSelectedTextStyle({ fontSize })}
                    />
                    <label>
                      <span>顏色</span>
                      <input
                        type="color"
                        aria-label="文字顏色"
                        value={selectedElement.style.color}
                        onChange={(event) => setSelectedTextStyle({
                          color: event.currentTarget.value,
                        })}
                      />
                    </label>
                    <label className="inspector-field-wide">
                      <span>字型</span>
                      <select
                        aria-label="文字字型"
                        value={selectedElement.style.fontFamily ?? 'sans-serif'}
                        onChange={(event) => setSelectedTextStyle({
                          fontFamily: event.currentTarget.value as FontFamily,
                        })}
                      >
                        <option value="sans-serif">無襯線</option>
                        <option value="serif">襯線</option>
                        <option value="monospace">等寬</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      aria-pressed={(selectedElement.style.fontWeight ?? 'normal') === 'bold'}
                      onClick={() => setSelectedTextStyle({
                        fontWeight: (selectedElement.style.fontWeight ?? 'normal') === 'bold'
                          ? 'normal' : 'bold',
                      })}
                    >粗體</button>
                    <button
                      type="button"
                      aria-pressed={(selectedElement.style.fontStyle ?? 'normal') === 'italic'}
                      onClick={() => setSelectedTextStyle({
                        fontStyle: (selectedElement.style.fontStyle ?? 'normal') === 'italic'
                          ? 'normal' : 'italic',
                      })}
                    >斜體</button>
                    <InspectorNumberField
                      label="行距"
                      value={selectedElement.style.lineHeight ?? 1.2}
                      min={1}
                      max={3}
                      step={0.1}
                      onCommit={(lineHeight) => setSelectedTextStyle({ lineHeight })}
                    />
                    <label className="inspector-field-wide">
                      <span>對齊</span>
                      <select
                        aria-label="文字對齊"
                        value={selectedElement.style.textAlign}
                        onChange={(event) => setSelectedTextStyle({
                          textAlign: event.currentTarget.value as TextAlign,
                        })}
                      >
                        <option value="left">靠左</option>
                        <option value="center">置中</option>
                        <option value="right">靠右</option>
                      </select>
                    </label>
                  </div>
                </>
              )}
              {selectedElement.type === 'image' && (
                <>
                  <p className="inspector-section-title">圖片</p>
                  <div className="inspector-grid">
                    <button
                      className="inspector-field-wide"
                      type="button"
                      onClick={() => replaceImageInputRef.current?.click()}
                    >替換圖片</button>
                    <label>
                      <span>顯示方式</span>
                      <select
                        aria-label="圖片顯示方式"
                        value={selectedElement.fit ?? 'contain'}
                        onChange={(event) => setSelectedImage({
                          fit: event.currentTarget.value as 'contain' | 'cover',
                        })}
                      >
                        <option value="contain">完整顯示</option>
                        <option value="cover">填滿裁切</option>
                      </select>
                    </label>
                    <label>
                      <span>裁切位置</span>
                      <select
                        aria-label="圖片裁切位置"
                        value={selectedElement.position ?? 'center'}
                        onChange={(event) => setSelectedImage({
                          position: event.currentTarget.value as ImagePosition,
                        })}
                      >
                        <option value="center">中央</option>
                        <option value="top">上方</option>
                        <option value="right">右側</option>
                        <option value="bottom">下方</option>
                        <option value="left">左側</option>
                      </select>
                    </label>
                  </div>
                </>
              )}
              {selectedElement.type === 'shape' && (
                <>
                  <p className="inspector-section-title">圖形</p>
                  <div className="inspector-grid">
                    <label className="inspector-field-wide">
                      <span>形狀</span>
                      <select
                        aria-label="圖形種類"
                        value={selectedElement.shape}
                        onChange={(event) => setSelectedShape({
                          shape: event.currentTarget.value as ShapeKind,
                        })}
                      >
                        <option value="rectangle">矩形</option>
                        <option value="ellipse">圓形</option>
                        <option value="line">直線</option>
                        <option value="arrow">箭頭</option>
                      </select>
                    </label>
                    <label>
                      <span>填滿</span>
                      <input
                        type="color"
                        aria-label="圖形填滿顏色"
                        value={selectedElement.style.fill}
                        onChange={(event) => setSelectedShape({
                          style: {
                            ...selectedElement.style,
                            fill: event.currentTarget.value,
                          },
                        })}
                      />
                    </label>
                    <label>
                      <span>外框</span>
                      <input
                        type="color"
                        aria-label="圖形外框顏色"
                        value={selectedElement.style.stroke}
                        onChange={(event) => setSelectedShape({
                          style: {
                            ...selectedElement.style,
                            stroke: event.currentTarget.value,
                          },
                        })}
                      />
                    </label>
                    <InspectorNumberField
                      label="外框寬度"
                      value={selectedElement.style.strokeWidth}
                      min={0}
                      max={40}
                      onCommit={(strokeWidth) => setSelectedShape({
                        style: { ...selectedElement.style, strokeWidth },
                      })}
                    />
                  </div>
                </>
              )}
            </div>
          )}
          <div className="inspector-fields">
            <p className="inspector-section-title">投影片</p>
            <div className="inspector-grid">
              <label className="inspector-field-wide">
                <span>背景顏色</span>
                <input
                  type="color"
                  aria-label="投影片背景顏色"
                  value={activeSlide.background}
                  onChange={(event) => updateDocument({
                    type: 'slide/set-background',
                    slideId: resolvedActiveSlideId,
                    background: event.currentTarget.value,
                  })}
                />
              </label>
              <button
                className="inspector-field-wide"
                type="button"
                disabled={!activeSlide.hidden && visibleSlideOrder.length === 1}
                onClick={toggleActiveSlideHidden}
              >
                {activeSlide.hidden ? '取消略過投影片' : '播放與 PDF 略過此頁'}
              </button>
            </div>
            <p className="inspector-section-title">快速版型（空白頁）</p>
            <div className="inspector-buttons three-columns">
              <button
                type="button"
                disabled={activeSlide.elements.length > 0}
                onClick={() => applyLayout('title')}
              >標題頁</button>
              <button
                type="button"
                disabled={activeSlide.elements.length > 0}
                onClick={() => applyLayout('content')}
              >標題內容</button>
              <button
                type="button"
                disabled={activeSlide.elements.length > 0}
                onClick={() => applyLayout('columns')}
              >雙欄</button>
            </div>
            <label className="slide-notes">
              <span>講者備註</span>
              <textarea
                aria-label="講者備註"
                maxLength={5000}
                placeholder="記下播放時要補充的內容"
                value={activeSlide.notes ?? ''}
                onChange={(event) => updateDocument({
                  type: 'slide/set-notes',
                  slideId: resolvedActiveSlideId,
                  notes: event.currentTarget.value,
                })}
              />
            </label>
          </div>
          <dl className="document-facts">
            <div><dt>畫布</dt><dd>1600 × 900</dd></div>
            <div><dt>比例</dt><dd>16:9</dd></div>
            <div><dt>物件</dt><dd>{activeSlide.elements.length}</dd></div>
          </dl>
        </aside>
      </section>
      </main>
      <PrintDocument presentation={outputPresentation} />
      {presenting && (
        <PresentationMode
          presentation={outputPresentation}
          initialSlideId={outputInitialSlideId}
          onSlideChange={selectSlide}
          onExit={() => setPresenting(false)}
        />
      )}
    </>
  )
}
