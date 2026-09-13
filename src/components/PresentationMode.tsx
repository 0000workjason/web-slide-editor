import { useCallback, useEffect, useState } from 'react'
import { useCanvasScale } from '../editor/useCanvasScale'
import type { PresentationDocument } from '../model/presentation'
import { SlideRenderer } from './SlideRenderer'

interface PresentationModeProps {
  presentation: PresentationDocument
  initialSlideId: string
  onSlideChange: (slideId: string) => void
  onExit: () => void
}

export function PresentationMode({
  presentation,
  initialSlideId,
  onSlideChange,
  onExit,
}: PresentationModeProps) {
  const [activeSlideId, setActiveSlideId] = useState(initialSlideId)
  const [blanked, setBlanked] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const { viewportRef, scale } = useCanvasScale(
    presentation.canvas.width,
    presentation.canvas.height,
    'fit',
  )
  const activeIndex = Math.max(
    0,
    presentation.slideOrder.indexOf(activeSlideId),
  )
  const selectIndex = useCallback((index: number) => {
    const boundedIndex = Math.max(
      0,
      Math.min(presentation.slideOrder.length - 1, index),
    )
    const slideId = presentation.slideOrder[boundedIndex]
    setActiveSlideId(slideId)
    onSlideChange(slideId)
  }, [onSlideChange, presentation.slideOrder])

  const toggleFullscreen = useCallback(() => {
    const request = document.fullscreenElement
      ? document.exitFullscreen()
      : viewportRef.current?.requestFullscreen?.()
    void request?.catch(() => undefined)
  }, [viewportRef])

  const exitPresentation = useCallback(() => {
    if (document.fullscreenElement === viewportRef.current) {
      void document.exitFullscreen().catch(() => undefined)
    }
    onExit()
  }, [onExit, viewportRef])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === viewportRef.current)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [viewportRef])

  useEffect(() => {
    viewportRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        exitPresentation()
        return
      }
      if (event.key.toLowerCase() === 'b') {
        event.preventDefault()
        setBlanked((current) => !current)
        return
      }
      if (event.key.toLowerCase() === 'f') {
        event.preventDefault()
        toggleFullscreen()
        return
      }
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault()
        selectIndex(activeIndex + 1)
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault()
        selectIndex(activeIndex - 1)
        return
      }
      if (event.key === 'Home') {
        event.preventDefault()
        selectIndex(0)
      }
      if (event.key === 'End') {
        event.preventDefault()
        selectIndex(presentation.slideOrder.length - 1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    activeIndex,
    exitPresentation,
    presentation.slideOrder.length,
    selectIndex,
    toggleFullscreen,
    viewportRef,
  ])

  const slide = presentation.slides[presentation.slideOrder[activeIndex]]

  return (
    <section
      ref={viewportRef}
      className="presentation-mode"
      role="dialog"
      aria-modal="true"
      aria-label="播放模式"
      tabIndex={-1}
    >
      <div
        className="presentation-mode__frame"
        style={{
          width: presentation.canvas.width * scale,
          height: presentation.canvas.height * scale,
        }}
      >
        <div
          key={slide.id}
          className={`presentation-mode__slide is-${slide.transition ?? 'none'}`}
        >
          <SlideRenderer
            slide={slide}
            canvas={presentation.canvas}
            style={{ transform: `scale(${scale})` }}
          />
        </div>
      </div>
      {blanked && <div className="presentation-mode__blank" aria-label="播放黑畫面" />}
      <div className="presentation-mode__controls">
        <button
          type="button"
          aria-label="上一張投影片"
          disabled={activeIndex === 0}
          onClick={() => selectIndex(activeIndex - 1)}
        >
          ←
        </button>
        <span aria-live="polite">
          {activeIndex + 1} / {presentation.slideOrder.length}
        </span>
        <button
          type="button"
          aria-label="下一張投影片"
          disabled={activeIndex === presentation.slideOrder.length - 1}
          onClick={() => selectIndex(activeIndex + 1)}
        >
          →
        </button>
        <button
          type="button"
          aria-pressed={blanked}
          title="B"
          onClick={() => setBlanked((current) => !current)}
        >
          {blanked ? '返回投影片' : '黑畫面'}
        </button>
        <button
          type="button"
          aria-label={isFullscreen ? '離開全螢幕' : '進入全螢幕'}
          title="F"
          onClick={toggleFullscreen}
        >
          {isFullscreen ? '離開全螢幕' : '全螢幕'}
        </button>
        <button type="button" onClick={exitPresentation}>結束播放</button>
      </div>
    </section>
  )
}
