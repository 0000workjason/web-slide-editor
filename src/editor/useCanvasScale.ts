import { useEffect, useMemo, useRef, useState } from 'react'

const VIEWPORT_PADDING = 56

export type ZoomMode = 'fit' | number

export function useCanvasScale(
  canvasWidth: number,
  canvasHeight: number,
  zoomMode: ZoomMode,
) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const measure = () => {
      const rect = viewport.getBoundingClientRect()
      setViewportSize({ width: rect.width, height: rect.height })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  const fitScale = useMemo(() => {
    if (!viewportSize.width || !viewportSize.height) return 0.5
    const availableWidth = Math.max(1, viewportSize.width - VIEWPORT_PADDING)
    const availableHeight = Math.max(1, viewportSize.height - VIEWPORT_PADDING)
    return Math.min(1, availableWidth / canvasWidth, availableHeight / canvasHeight)
  }, [canvasHeight, canvasWidth, viewportSize])

  return {
    viewportRef,
    scale: zoomMode === 'fit' ? fitScale : zoomMode,
  }
}
