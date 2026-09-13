import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createInitialDocument, createTextElement } from './model/presentation'
import { presentationReducer } from './editor/presentationReducer'
import {
  deletePresentationDatabase,
  loadAsset,
  loadPresentation,
  savePresentation,
} from './storage/presentationDb'

async function getReadyAddButton() {
  const button = screen.getByRole('button', { name: '新增文字' })
  await waitFor(() => expect(button).toBeEnabled())
  return button
}

describe('App', () => {
  beforeEach(async () => {
    await deletePresentationDatabase()
  })

  it('adds a text element and accepts Chinese text', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await getReadyAddButton())
    const editor = screen.getByRole('textbox', { name: '文字內容' })
    await user.clear(editor)
    await user.type(editor, '中文研究分享')

    expect(editor).toHaveValue('中文研究分享')
    expect(screen.getByText('正在編輯文字')).toBeInTheDocument()
  })

  it('does not delete an element while its text editor is focused', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await getReadyAddButton())
    const editor = screen.getByRole('textbox', { name: '文字內容' })
    fireEvent.compositionStart(editor)
    fireEvent.keyDown(editor, { key: 'Delete', isComposing: true })
    fireEvent.compositionEnd(editor)

    expect(screen.getByRole('textbox', { name: '文字內容' })).toBeInTheDocument()
  })

  it('deletes a selected element from the canvas with Delete', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await getReadyAddButton())
    const editor = screen.getByRole('textbox', { name: '文字內容' })
    fireEvent.blur(editor)
    fireEvent.keyDown(window, { key: 'Delete' })

    expect(screen.queryByRole('textbox', { name: '文字內容' })).not.toBeInTheDocument()
  })

  it('commits one logical position after a scaled pointer drag', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)

    await user.click(await getReadyAddButton())
    fireEvent.blur(screen.getByRole('textbox', { name: '文字內容' }))
    const element = container.querySelector<HTMLElement>('.text-element')
    expect(element).not.toBeNull()

    fireEvent.pointerDown(element!, {
      pointerId: 1,
      button: 0,
      clientX: 100,
      clientY: 100,
    })
    fireEvent.pointerMove(element!, {
      pointerId: 1,
      clientX: 150,
      clientY: 130,
    })
    fireEvent.pointerUp(element!, { pointerId: 1 })

    expect(element).toHaveStyle({ left: '280px', top: '230px' })
  })

  it('restores a saved presentation when the app starts', async () => {
    const initial = createInitialDocument()
    const savedDocument = presentationReducer(initial, {
      type: 'element/add',
      slideId: 'slide-1',
      element: {
        ...createTextElement('saved-text'),
        text: '重新開啟後仍存在',
        x: 360,
        y: 280,
      },
    })
    await savePresentation(savedDocument)

    const { container } = render(<App />)

    expect(await screen.findByDisplayValue('重新開啟後仍存在')).toBeInTheDocument()
    expect(container.querySelector('.text-element')).toHaveStyle({
      left: '360px',
      top: '280px',
    })
    expect(screen.getByRole('status')).toHaveTextContent('已儲存在這台裝置')
  })

  it('imports an image, stores its Blob, and saves the asset reference', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 640, height: 480, close: vi.fn() }),
    )
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-chart')
    render(<App />)
    await getReadyAddButton()
    const file = new File(['png-data'], 'chart.png', { type: 'image/png' })

    await user.upload(
      screen.getByLabelText('選擇 PNG 或 JPEG 圖片'),
      file,
    )

    expect(await screen.findAllByAltText('chart.png')).toHaveLength(3)
    await waitFor(
      () => expect(screen.getByRole('status')).toHaveTextContent('已儲存在這台裝置'),
      { timeout: 2000 },
    )
    const savedDocument = await loadPresentation()
    const image = savedDocument?.slides['slide-1'].elements[0]
    expect(image).toMatchObject({
      type: 'image',
      alt: 'chart.png',
      width: 640,
      height: 480,
    })
    if (image?.type !== 'image') throw new Error('Expected a saved image element.')
    await expect(loadAsset(image.assetId)).resolves.toMatchObject({
      fileName: 'chart.png',
      width: 640,
      height: 480,
    })

    const replacement = new File(['new-png-data'], 'replacement.png', {
      type: 'image/png',
    })
    await user.upload(screen.getByLabelText('選擇替換圖片'), replacement)
    expect(await screen.findAllByAltText('replacement.png')).toHaveLength(3)
    await waitFor(
      () => expect(screen.getByRole('status')).toHaveTextContent('已儲存在這台裝置'),
      { timeout: 2000 },
    )
    const replacedDocument = await loadPresentation()
    expect(replacedDocument?.slides['slide-1'].elements[0]).toMatchObject({
      type: 'image',
      alt: 'replacement.png',
    })
  })

  it('adds and switches between slides without sharing their elements', async () => {
    const user = userEvent.setup()
    render(<App />)
    await getReadyAddButton()

    await user.click(screen.getByRole('button', { name: '新增投影片' }))
    expect(screen.getByRole('button', { name: '投影片 2' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await user.click(await getReadyAddButton())
    expect(screen.getByRole('textbox', { name: '文字內容' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '投影片 1' }))
    expect(screen.queryByRole('textbox', { name: '文字內容' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '投影片 2' }))
    expect(screen.getByRole('textbox', { name: '文字內容' })).toBeInTheDocument()
  })

  it('omits skipped slides from playback and PDF output', async () => {
    const user = userEvent.setup()
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    render(<App />)
    await getReadyAddButton()
    await user.click(screen.getByRole('button', { name: '新增投影片' }))

    expect(screen.getAllByRole('article', { name: /列印投影片/ })).toHaveLength(2)
    await user.click(screen.getByRole('button', {
      name: '播放與 PDF 略過目前投影片',
    }))
    expect(screen.getAllByRole('article', { name: /列印投影片/ })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: '播放' }))
    expect(screen.getByText('1 / 1')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    await user.click(screen.getByRole('button', { name: '輸出 PDF' }))

    await waitFor(() => expect(printSpy).toHaveBeenCalledOnce())
  })

  it('locks layout changes and updates appearance', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)

    await user.click(await getReadyAddButton())
    fireEvent.blur(screen.getByRole('textbox', { name: '文字內容' }))
    await user.click(screen.getByRole('button', { name: '鎖定位置' }))

    expect(screen.getByRole('spinbutton', { name: 'X' })).toBeDisabled()
    expect(screen.getByRole('spinbutton', { name: '旋轉角度 (°)' })).toBeDisabled()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(container.querySelector('.text-element')).toHaveStyle({ left: '180px' })

    const opacity = screen.getByRole('spinbutton', { name: '不透明度 (%)' })
    fireEvent.change(opacity, { target: { value: '40' } })
    fireEvent.blur(opacity)
    expect(container.querySelector('.text-element textarea')).toHaveStyle({ opacity: '0.4' })

    await user.click(screen.getByRole('button', { name: '解除位置鎖定' }))
    const rotation = screen.getByRole('spinbutton', { name: '旋轉角度 (°)' })
    fireEvent.change(rotation, { target: { value: '30' } })
    fireEvent.blur(rotation)
    expect(container.querySelector('.text-element')).toHaveStyle({
      transform: 'rotate(30deg)',
    })
    for (const element of container.querySelectorAll('.static-slide-element')) {
      expect(element).toHaveStyle({ transform: 'rotate(30deg) scale(1, 1)' })
    }
  })

  it('rotates a selected element by dragging its rotation handle', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await user.click(await getReadyAddButton())
    fireEvent.blur(screen.getByRole('textbox', { name: '文字內容' }))

    const element = container.querySelector<HTMLElement>('.text-element')!
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 100, 100),
    )
    const handle = screen.getByRole('button', { name: '旋轉文字框' })
    fireEvent.pointerDown(handle, {
      pointerId: 21,
      button: 0,
      clientX: 50,
      clientY: 0,
    })
    fireEvent.pointerMove(handle, {
      pointerId: 21,
      clientX: 100,
      clientY: 50,
    })

    expect(element).toHaveStyle({ transform: 'rotate(90deg)' })
    fireEvent.pointerUp(handle, {
      pointerId: 21,
      clientX: 100,
      clientY: 50,
    })
    expect(screen.getByRole('spinbutton', { name: '旋轉角度 (°)' }))
      .toHaveValue(90)
  })

  it('duplicates and deletes the active slide while keeping one slide', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await getReadyAddButton())
    const editor = screen.getByRole('textbox', { name: '文字內容' })
    await user.clear(editor)
    await user.type(editor, '要一起複製的內容')

    await user.click(screen.getByRole('button', { name: '複製目前投影片' }))
    expect(screen.getByRole('button', { name: '投影片 2' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('textbox', { name: '文字內容' })).toHaveValue(
      '要一起複製的內容',
    )

    await user.click(screen.getByRole('button', { name: '刪除目前投影片' }))
    expect(screen.queryByRole('button', { name: '投影片 2' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '文字內容' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '刪除目前投影片' })).toBeDisabled()
  })

  it('moves the active slide and updates its position controls', async () => {
    const user = userEvent.setup()
    render(<App />)
    await getReadyAddButton()
    await user.click(screen.getByRole('button', { name: '新增投影片' }))

    expect(screen.getByRole('button', { name: '將目前投影片往後移' })).toBeDisabled()
    await user.click(
      screen.getByRole('button', { name: '將目前投影片往前移' }),
    )

    expect(screen.getByRole('button', { name: '投影片 1' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('button', { name: '將目前投影片往前移' })).toBeDisabled()
  })

  it('reorders slides by dragging a thumbnail', async () => {
    const user = userEvent.setup()
    render(<App />)
    await getReadyAddButton()
    await user.click(screen.getByRole('button', { name: '新增投影片' }))
    await user.click(screen.getByRole('button', { name: '新增投影片' }))

    const source = screen.getByRole('button', { name: '投影片 3' })
    const target = screen.getByRole('button', { name: '投影片 1' })
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 100,
      bottom: 100,
      left: 0,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    })
    const data = new Map<string, string>()
    const dataTransfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: (format: string, value: string) => data.set(format, value),
      getData: (format: string) => data.get(format) ?? '',
    }

    fireEvent.dragStart(source, { dataTransfer })
    const dragOver = createEvent.dragOver(target, { dataTransfer })
    const drop = createEvent.drop(target, { dataTransfer })
    Object.defineProperty(dragOver, 'clientY', { value: 10 })
    Object.defineProperty(drop, 'clientY', { value: 10 })
    fireEvent(target, dragOver)
    fireEvent(target, drop)

    expect(screen.getByRole('button', { name: '投影片 1' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('undoes and redoes a document change', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await getReadyAddButton())
    fireEvent.blur(screen.getByRole('textbox', { name: '文字內容' }))
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(screen.queryByRole('textbox', { name: '文字內容' })).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
    expect(screen.getByRole('textbox', { name: '文字內容' })).toBeInTheDocument()
  })

  it('resizes a selected text element using logical coordinates', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)

    await user.click(await getReadyAddButton())
    fireEvent.blur(screen.getByRole('textbox', { name: '文字內容' }))
    const handle = screen.getByRole('button', { name: '調整文字框大小' })
    fireEvent.pointerDown(handle, {
      pointerId: 2,
      button: 0,
      clientX: 100,
      clientY: 100,
    })
    fireEvent.pointerMove(handle, {
      pointerId: 2,
      clientX: 150,
      clientY: 125,
    })
    fireEvent.pointerUp(handle, { pointerId: 2 })

    expect(container.querySelector('.text-element')).toHaveStyle({
      width: '620px',
      height: '200px',
    })

    const widthInput = screen.getByRole('spinbutton', { name: '寬度' })
    fireEvent.change(widthInput, { target: { value: '0' } })
    fireEvent.blur(widthInput)
    expect(container.querySelector('.text-element')).toHaveStyle({
      width: '620px',
      height: '200px',
    })

    await user.click(screen.getByRole('button', { name: '復原' }))
    expect(container.querySelector('.text-element')).toHaveStyle({
      width: '520px',
      height: '150px',
    })
  })

  it('presents slides with keyboard navigation and exits with Escape', async () => {
    const user = userEvent.setup()
    render(<App />)
    await getReadyAddButton()
    await user.click(screen.getByRole('button', { name: '新增投影片' }))
    await user.selectOptions(
      screen.getByRole('combobox', { name: '投影片轉場' }),
      'fade',
    )
    await user.click(screen.getByRole('button', { name: '播放' }))

    const dialog = screen.getByRole('dialog', { name: '播放模式' })
    const requestFullscreen = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(dialog, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
    expect(dialog.querySelector('.presentation-mode__slide')).toHaveClass('is-fade')
    await user.click(screen.getByRole('button', { name: '進入全螢幕' }))
    expect(requestFullscreen).toHaveBeenCalledOnce()
    fireEvent.keyDown(window, { key: 'b' })
    expect(screen.getByLabelText('播放黑畫面')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'b' })
    expect(screen.queryByLabelText('播放黑畫面')).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Home' })
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    expect(dialog.querySelector('.presentation-mode__slide')).toHaveClass('is-none')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '播放模式' })).not.toBeInTheDocument()
  })

  it('groups a multi-selection and duplicates it with one shortcut', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await user.click(await getReadyAddButton())
    fireEvent.blur(screen.getByRole('textbox', { name: '文字內容' }))
    await user.selectOptions(screen.getByRole('combobox', { name: '新增圖形' }), 'rectangle')

    const text = container.querySelector<HTMLElement>('.text-element')!
    fireEvent.pointerDown(text, { pointerId: 3, button: 0, shiftKey: true })
    fireEvent.pointerUp(text, { pointerId: 3 })
    expect(screen.getByText('已選取 2 個物件')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '群組' }))
    fireEvent.keyDown(window, { key: 'd', ctrlKey: true })
    expect(container.querySelectorAll('.slide-element')).toHaveLength(4)
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true })
    expect(container.querySelectorAll('.slide-element')).toHaveLength(6)
  })

  it('applies a starter layout to an empty slide', async () => {
    const user = userEvent.setup()
    render(<App />)
    await getReadyAddButton()

    await user.click(screen.getByRole('button', { name: '標題頁' }))

    expect(screen.getByDisplayValue('簡報標題')).toBeInTheDocument()
    expect(screen.getByDisplayValue('副標題')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '標題頁' })).toBeDisabled()
  })

  it('formats text and stores slide speaker notes', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await user.click(await getReadyAddButton())
    fireEvent.blur(screen.getByRole('textbox', { name: '文字內容' }))

    await user.click(screen.getByRole('button', { name: '粗體' }))
    await user.click(screen.getByRole('button', { name: '斜體' }))
    await user.selectOptions(screen.getByRole('combobox', { name: '文字字型' }), 'serif')
    const lineHeight = screen.getByRole('spinbutton', { name: '行距' })
    fireEvent.change(lineHeight, { target: { value: '1.6' } })
    fireEvent.blur(lineHeight)

    expect(container.querySelector('.text-element textarea')).toHaveStyle({
      fontFamily: 'serif',
      fontWeight: 'bold',
      fontStyle: 'italic',
      lineHeight: '1.6',
    })
    await user.type(screen.getByRole('textbox', { name: '講者備註' }), '提醒說明資料來源')
    expect(screen.getByRole('textbox', { name: '講者備註' }))
      .toHaveValue('提醒說明資料來源')
  })

  it('flips a shape in the editor and shared renderers', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await getReadyAddButton()
    await user.selectOptions(
      screen.getByRole('combobox', { name: '新增圖形' }),
      'arrow',
    )

    await user.click(screen.getByRole('button', { name: '水平翻轉' }))
    await user.click(screen.getByRole('button', { name: '垂直翻轉' }))

    expect(screen.getByRole('button', { name: '水平翻轉' }))
      .toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '垂直翻轉' }))
      .toHaveAttribute('aria-pressed', 'true')
    expect(container.querySelector('.shape-element')).toHaveStyle({
      transform: 'rotate(0deg)',
    })
    expect(container.querySelector('.shape-element .element-visual')).toHaveStyle({
      transform: 'scale(-1, -1)',
    })
    for (const element of container.querySelectorAll('.static-slide-element')) {
      expect(element).toHaveStyle({ transform: 'rotate(0deg) scale(-1, -1)' })
    }
  })

  it('marquee-selects, cuts, and pastes elements onto another slide', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await user.click(await getReadyAddButton())
    fireEvent.blur(screen.getByRole('textbox', { name: '文字內容' }))
    await user.selectOptions(screen.getByRole('combobox', { name: '新增圖形' }), 'arrow')
    const canvas = container.querySelector<HTMLElement>('.slide-canvas')!
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 800, 450))

    fireEvent.pointerDown(canvas, { pointerId: 8, button: 0, clientX: 40, clientY: 40 })
    fireEvent.pointerMove(canvas, { pointerId: 8, clientX: 520, clientY: 340 })
    fireEvent.pointerUp(canvas, { pointerId: 8, clientX: 520, clientY: 340 })
    expect(screen.getByText('已選取 2 個物件')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'x', ctrlKey: true })
    expect(container.querySelectorAll('.slide-element')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: '新增投影片' }))
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true })
    expect(container.querySelectorAll('.slide-element')).toHaveLength(2)
  })
})
