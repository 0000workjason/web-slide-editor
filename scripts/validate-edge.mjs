import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const repositoryRoot = process.cwd()
const appUrl = process.env.SLIDE_EDITOR_URL ?? 'http://127.0.0.1:5173'
const debugPort = 9300 + (process.pid % 500)
const profileDirectory = join(tmpdir(), `slide-editor-edge-${process.pid}`)
const evidenceDirectory = join(repositoryRoot, 'docs', 'validation', 'evidence')
const pdfPath = join(
  evidenceDirectory,
  '2026-09-12-v4-edge-two-slides.pdf',
)

const edgePath = findEdge()
await ensureApplicationIsRunning()
await mkdir(evidenceDirectory, { recursive: true })

const edge = spawn(
  edgePath,
  [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDirectory}`,
    '--no-first-run',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=1440,900',
    'about:blank',
  ],
  { stdio: 'ignore', windowsHide: true },
)

let client
try {
  await waitForDebugger()
  const targetResponse = await fetch(
    `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(appUrl)}`,
    { method: 'PUT' },
  )
  if (!targetResponse.ok) {
    throw new Error(`Edge target creation failed: HTTP ${targetResponse.status}`)
  }

  const target = await targetResponse.json()
  client = await createCdpClient(target.webSocketDebuggerUrl)
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await client.send('Page.navigate', { url: appUrl })

  await waitForExpression(
    client,
    `Array.from(document.querySelectorAll('button')).some(
      (button) => button.textContent.includes('新增文字') && !button.disabled
    )`,
    'editor hydration',
  )

  await clickButtonByText(client, '新增文字')
  await setEditingText(client, '第一張：圖片保存')
  await importGeneratedImage(client)
  await waitForExpression(
    client,
    `document.querySelectorAll('img[alt="驗收圖片.png"]').length >= 3 &&
      !document.querySelector('.image-placeholder.is-loading')`,
    'image loading',
  )

  await clickButtonByLabel(client, '複製目前投影片')
  await waitForSlideCount(client, 2)
  await startEditingFirstText(client)
  await setEditingText(client, '第二張：PDF 輸出')

  await clickButtonByLabel(client, '新增投影片')
  await waitForSlideCount(client, 3)
  await clickButtonByText(client, '新增文字')
  await setEditingText(client, '第三張：排序與刪除驗收')
  await clickButtonByLabel(client, '將目前投影片往前移')
  await waitForExpression(
    client,
    `document.querySelector('button[aria-current="page"]')?.getAttribute('aria-label') === '投影片 2'`,
    'slide reorder',
  )
  await clickButtonByLabel(client, '刪除目前投影片')
  await waitForSlideCount(client, 2)

  await waitForExpression(
    client,
    `document.querySelector('[role="status"]')?.textContent.includes('已儲存') &&
      document.querySelectorAll('.slide-thumbnail__preview').length === 2`,
    'autosave and thumbnail update',
  )

  await setInputByLabel(client, '簡報名稱', '完整流程驗收')
  await clickButtonByLabel(client, '縮小畫布')
  await clickElement(client, '.text-element')
  await dragElement(client, 'button[aria-label="調整文字框大小"]', 50, 25)
  await waitForExpression(
    client,
    `document.querySelector('.text-element')?.style.width === '620px' &&
      document.querySelector('.text-element')?.style.height === '200px'`,
    'scaled element resize',
  )
  await setInputByLabel(client, '字級', '56')
  await waitForExpression(
    client,
    `document.querySelector('.text-element textarea')?.style.fontSize === '56px' &&
      Boolean(document.querySelector('.inspector input[aria-label="字級"]'))`,
    'text style update',
  )
  await clickButtonByLabel(client, '復原')
  await waitForExpression(
    client,
    `document.querySelector('.text-element textarea')?.style.fontSize === '44px'`,
    'undo',
  )
  await clickButtonByLabel(client, '重做')
  await waitForExpression(
    client,
    `document.querySelector('.text-element textarea')?.style.fontSize === '56px'`,
    'redo',
  )

  await selectOptionByLabel(client, '新增圖形', 'rectangle')
  await waitForExpression(client, `document.querySelectorAll('.shape-element').length === 1`, 'shape creation')
  await clickElement(client, '.text-element', 8)
  await waitForExpression(
    client,
    `document.querySelector('.inspector-card strong')?.textContent.includes('已選取 2 個物件')`,
    'multi-selection',
  )
  await clickButtonExact(client, '群組')
  const positionsBeforeGroupDrag = await elementPositions(client, ['.text-element', '.shape-element'])
  await dragElement(client, '.shape-element', 30, 15)
  const positionsAfterGroupDrag = await elementPositions(client, ['.text-element', '.shape-element'])
  const groupDeltas = positionsAfterGroupDrag.map((position, index) => ({
    x: position.x - positionsBeforeGroupDrag[index].x,
    y: position.y - positionsBeforeGroupDrag[index].y,
  }))
  if (
    groupDeltas[0].x === 0 ||
    groupDeltas[0].x !== groupDeltas[1].x ||
    groupDeltas[0].y !== groupDeltas[1].y
  ) throw new Error('Grouped elements did not move by the same logical delta.')
  await clickButtonExact(client, '靠左')
  await waitForExpression(
    client,
    `document.querySelector('.text-element')?.style.left ===
      document.querySelector('.shape-element')?.style.left`,
    'multi-element alignment',
  )
  await pressKey(client, 'd', { ctrlKey: true })
  await waitForExpression(client, `document.querySelectorAll('.shape-element').length === 2`, 'selection duplication')

  await clickElement(client, '.image-element')
  await selectOptionByLabel(client, '圖片顯示方式', 'cover')
  await waitForExpression(
    client,
    `document.querySelector('.image-element img')?.style.objectFit === 'cover'`,
    'image crop mode',
  )
  await setInputByLabel(client, '投影片背景顏色', '#f4f0ff')
  await waitForExpression(
    client,
    `getComputedStyle(document.querySelector('.slide-canvas')).backgroundColor === 'rgb(244, 240, 255)'`,
    'slide background',
  )

  await pressKey(client, 'Escape')
  await clickElement(client, '.text-element')
  await clickButtonExact(client, '取消群組')
  await pressKey(client, 'Escape')
  await clickElement(client, '.text-element')
  await clickButtonExact(client, '粗體')
  await clickButtonExact(client, '斜體')
  await selectOptionByLabel(client, '文字字型', 'serif')
  await setInputByLabel(client, '行距', '1.6')
  await setInputByLabel(client, '不透明度 (%)', '40')
  await clickButtonExact(client, '鎖定位置')
  const positionBeforeLockedDrag = await elementPositions(client, ['.text-element'])
  await dragElement(client, '.text-element', 40, 20)
  const positionAfterLockedDrag = await elementPositions(client, ['.text-element'])
  if (
    positionBeforeLockedDrag[0].x !== positionAfterLockedDrag[0].x ||
    positionBeforeLockedDrag[0].y !== positionAfterLockedDrag[0].y
  ) throw new Error('A position-locked element moved during dragging.')
  await setTextareaByLabel(client, '講者備註', '說明研究方法與限制')
  await waitForExpression(
    client,
    `Array.from(document.querySelectorAll('.text-element textarea')).some((text) =>
      text.style.fontWeight === 'bold' &&
      text.style.fontStyle === 'italic' &&
      text.style.fontFamily === 'serif' &&
      text.style.lineHeight === '1.6' &&
      text.style.opacity === '0.4'
    ) && Array.from(document.querySelectorAll('.static-slide-element')).some(
      (element) => element.style.opacity === '0.4'
    )`,
    'extended text formatting',
  )

  const shapesBeforeArrow = await evaluate(client, `document.querySelectorAll('.shape-element').length`)
  await selectOptionByLabel(client, '新增圖形', 'arrow')
  await waitForExpression(
    client,
    `document.querySelectorAll('.shape-element').length === ${shapesBeforeArrow + 1} &&
      Boolean(document.querySelector('.shape-connector__arrow'))`,
    'arrow creation',
  )
  await pressKey(client, 'x', { ctrlKey: true })
  await waitForExpression(
    client,
    `document.querySelectorAll('.shape-element').length === ${shapesBeforeArrow}`,
    'cut selection',
  )
  await pressKey(client, 'v', { ctrlKey: true })
  await waitForExpression(
    client,
    `document.querySelectorAll('.shape-element').length === ${shapesBeforeArrow + 1}`,
    'cross-slide clipboard paste',
  )

  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: profileDirectory,
  })
  await clickButtonByText(client, '下載備份')
  const projectPath = await waitForDownloadedProject()
  const projectSource = await readFile(projectPath, 'utf8')
  await setInputByLabel(client, '簡報名稱', '匯入前的暫時名稱')
  await importProjectSource(client, projectSource)
  await waitForExpression(
    client,
    `document.querySelector('input[aria-label="簡報名稱"]')?.value === '完整流程驗收' &&
      document.querySelector('[role="status"]')?.textContent.includes('已儲存')`,
    'project backup import',
  )
  await clickButtonByLabel(client, '投影片 2')
  await waitForExpression(
    client,
    `document.querySelector('textarea[aria-label="講者備註"]')?.value === '說明研究方法與限制'`,
    'speaker notes after project import',
  )
  await waitForExpression(
    client,
    `document.querySelector('.text-element.is-position-locked textarea')?.style.opacity === '0.4'`,
    'V4 element settings after project import',
  )
  await clickButtonByLabel(client, '播放與 PDF 略過目前投影片')
  await waitForExpression(
    client,
    `document.querySelectorAll('.print-page').length === 1 &&
      Boolean(document.querySelector('button[aria-label="投影片 2，已略過"]'))`,
    'skipped slide output',
  )
  await clickButtonByText(client, '播放')
  await waitForExpression(
    client,
    `document.querySelector('[aria-label="播放模式"]')?.textContent.includes('1 / 1')`,
    'skipped slide presentation',
  )
  await pressKey(client, 'Escape')
  await clickButtonByLabel(client, '投影片 2，已略過')
  await clickButtonByLabel(client, '取消略過目前投影片')
  await clickButtonByLabel(client, '投影片 1')

  await clickButtonByText(client, '播放')
  await waitForExpression(
    client,
    `document.querySelector('[aria-label="播放模式"]')?.textContent.includes('1 / 2')`,
    'presentation mode',
  )
  await pressKey(client, 'End')
  await waitForExpression(
    client,
    `document.querySelector('[aria-label="播放模式"]')?.textContent.includes('2 / 2')`,
    'presentation navigation',
  )
  await pressKey(client, 'Escape')
  await waitForExpression(
    client,
    `!document.querySelector('[aria-label="播放模式"]')`,
    'presentation exit',
  )

  await waitForImages(client)

  await client.send('Emulation.setEmulatedMedia', { media: 'print' })
  await waitForImages(client)
  const printPageCount = await evaluate(
    client,
    `document.querySelectorAll('.print-page').length`,
  )
  if (printPageCount !== 2) {
    throw new Error(`Expected 2 print pages, received ${printPageCount}.`)
  }
  const printText = await evaluate(
    client,
    `document.querySelector('.print-document')?.textContent ?? ''`,
  )
  if (!printText.includes('第一張') || !printText.includes('第二張')) {
    throw new Error('The print document is missing expected Chinese slide text.')
  }
  if (printText.includes('說明研究方法與限制')) {
    throw new Error('Speaker notes must not appear in the print document.')
  }

  const pdf = await client.send('Page.printToPDF', {
    displayHeaderFooter: false,
    preferCSSPageSize: true,
    printBackground: true,
  })
  const pdfBuffer = Buffer.from(pdf.data, 'base64')
  await writeFile(pdfPath, pdfBuffer)

  const pdfEvidence = readPdfEvidence(pdfBuffer)
  if (pdfEvidence.pages !== 2) {
    throw new Error(`Expected a 2-page PDF, received ${pdfEvidence.pages} pages.`)
  }

  process.stdout.write([
    'Edge validation passed.',
    '- slide duplication, reordering, deletion, and thumbnails: passed',
    '- autosave after slide management: passed',
    '- scaled resize, inspector styling, undo, and redo: passed',
    '- shapes, multi-select, grouping, aligned group drag, and duplication: passed',
    '- image crop mode and slide background: passed',
    '- extended text styles, speaker notes, arrows, cut, and paste: passed',
    '- opacity, position lock, and skipped-slide output: passed',
    '- project backup download and import: passed',
    '- presentation keyboard navigation: passed',
    '- print DOM pages: 2',
    '- generated PDF pages: 2',
    '- Chinese text and images before PDF capture: passed',
    `- PDF: ${pdfPath}`,
    '',
  ].join('\n'))
} finally {
  client?.close()
  edge.kill()
  const resolvedProfile = resolve(profileDirectory)
  const resolvedTemp = `${resolve(tmpdir())}\\`
  if (resolvedProfile.startsWith(resolvedTemp)) {
    await rm(resolvedProfile, { recursive: true, force: true }).catch(() => undefined)
  }
}

function findEdge() {
  const candidates = [
    process.env.EDGE_PATH,
    process.env['ProgramFiles(x86)']
      ? join(process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe')
      : undefined,
    process.env.ProgramFiles
      ? join(process.env.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
      : undefined,
    process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
      : undefined,
  ]
  const match = candidates.find((candidate) => candidate && existsSync(candidate))
  if (!match) throw new Error('Microsoft Edge was not found. Set EDGE_PATH and retry.')
  return match
}

async function ensureApplicationIsRunning() {
  const response = await fetch(appUrl).catch(() => undefined)
  if (!response?.ok) {
    throw new Error(`The development server is unavailable at ${appUrl}.`)
  }
}

async function waitForDebugger() {
  const endpoint = `http://127.0.0.1:${debugPort}/json/version`
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const response = await fetch(endpoint).catch(() => undefined)
    if (response?.ok) return
    await delay(100)
  }
  throw new Error('Timed out while starting Microsoft Edge.')
}

async function createCdpClient(url) {
  const socket = new WebSocket(url)
  await new Promise((resolvePromise, reject) => {
    socket.addEventListener('open', resolvePromise, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

  let sequence = 0
  const pending = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (!message.id) return
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  })

  return {
    close: () => socket.close(),
    send(method, params = {}) {
      return new Promise((resolvePromise, reject) => {
        const id = ++sequence
        pending.set(id, { resolve: resolvePromise, reject })
        socket.send(JSON.stringify({ id, method, params }))
      })
    },
  }
}

async function evaluate(clientInstance, expression) {
  const result = await clientInstance.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? 'Browser evaluation failed.')
  }
  return result.result.value
}

async function waitForExpression(clientInstance, expression, description) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (await evaluate(clientInstance, expression)) return
    await delay(100)
  }
  throw new Error(`Timed out while waiting for ${description}.`)
}

async function clickButtonByText(clientInstance, text) {
  const clicked = await evaluate(
    clientInstance,
    `(() => {
      const button = Array.from(document.querySelectorAll('button')).find(
        (candidate) => candidate.textContent.includes(${JSON.stringify(text)}),
      )
      if (!button || button.disabled) return false
      button.click()
      return true
    })()`,
  )
  if (!clicked) throw new Error(`Could not click button containing: ${text}`)
}

async function clickButtonExact(clientInstance, text) {
  const clicked = await evaluate(
    clientInstance,
    `(() => {
      const button = Array.from(document.querySelectorAll('button')).find(
        (candidate) => candidate.textContent.trim() === ${JSON.stringify(text)},
      )
      if (!button || button.disabled) return false
      button.click()
      return true
    })()`,
  )
  if (!clicked) throw new Error(`Could not click button: ${text}`)
}

async function selectOptionByLabel(clientInstance, label, value) {
  const changed = await evaluate(
    clientInstance,
    `(() => {
      const select = document.querySelector(
        'select[aria-label=${JSON.stringify(label)}]',
      )
      if (!select) return false
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        'value',
      ).set
      valueSetter.call(select, ${JSON.stringify(value)})
      select.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    })()`,
  )
  if (!changed) throw new Error(`Could not update select labelled: ${label}`)
}

async function clickButtonByLabel(clientInstance, label) {
  const clicked = await evaluate(
    clientInstance,
    `(() => {
      const button = document.querySelector(
        'button[aria-label=${JSON.stringify(label)}]',
      )
      if (!button || button.disabled) return false
      button.click()
      return true
    })()`,
  )
  if (!clicked) throw new Error(`Could not click button labelled: ${label}`)
}

async function setInputByLabel(clientInstance, label, value) {
  const changed = await evaluate(
    clientInstance,
    `(() => {
      const input = document.querySelector(
        'input[aria-label=${JSON.stringify(label)}]',
      )
      if (!input) return false
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      ).set
      input.focus()
      valueSetter.call(input, ${JSON.stringify(value)})
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.blur()
      return true
    })()`,
  )
  if (!changed) throw new Error(`Could not update input labelled: ${label}`)
}

async function setTextareaByLabel(clientInstance, label, value) {
  const changed = await evaluate(
    clientInstance,
    `(() => {
      const textarea = document.querySelector(
        'textarea[aria-label=${JSON.stringify(label)}]',
      )
      if (!textarea) return false
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      ).set
      valueSetter.call(textarea, ${JSON.stringify(value)})
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`,
  )
  if (!changed) throw new Error(`Could not update textarea labelled: ${label}`)
}

async function clickElement(clientInstance, selector, modifiers = 0) {
  const point = await evaluate(
    clientInstance,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)})
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    })()`,
  )
  if (!point) throw new Error(`Could not find element: ${selector}`)
  await clientInstance.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'left',
    clickCount: 1,
    modifiers,
  })
  await clientInstance.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x,
    y: point.y,
    button: 'left',
    clickCount: 1,
    modifiers,
  })
}

async function elementPositions(clientInstance, selectors) {
  return evaluate(
    clientInstance,
    `(${JSON.stringify(selectors)}).map((selector) => {
      const element = document.querySelector(selector)
      return { x: Number.parseFloat(element.style.left), y: Number.parseFloat(element.style.top) }
    })`,
  )
}

async function dragElement(clientInstance, selector, deltaX, deltaY) {
  const point = await evaluate(
    clientInstance,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)})
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    })()`,
  )
  if (!point) throw new Error(`Could not find drag handle: ${selector}`)
  await clientInstance.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'left',
    clickCount: 1,
  })
  await clientInstance.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: point.x + deltaX,
    y: point.y + deltaY,
    button: 'left',
    buttons: 1,
  })
  await clientInstance.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x + deltaX,
    y: point.y + deltaY,
    button: 'left',
    clickCount: 1,
  })
}

async function importProjectSource(clientInstance, source) {
  const imported = await evaluate(
    clientInstance,
    `(() => {
      const input = document.querySelector('input[aria-label="選擇簡報專案備份"]')
      if (!input) return false
      const file = new File(
        [${JSON.stringify(source)}],
        '完整流程驗收.slide-project.json',
        { type: 'application/json' },
      )
      const transfer = new DataTransfer()
      transfer.items.add(file)
      input.files = transfer.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    })()`,
  )
  if (!imported) throw new Error('Could not import the project backup.')
}

async function pressKey(clientInstance, key, options = {}) {
  await evaluate(
    clientInstance,
    `window.dispatchEvent(new KeyboardEvent('keydown', {
      key: ${JSON.stringify(key)},
      ctrlKey: ${Boolean(options.ctrlKey)},
      metaKey: ${Boolean(options.metaKey)},
      shiftKey: ${Boolean(options.shiftKey)},
      bubbles: true,
    }))`,
  )
}

async function waitForDownloadedProject() {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const files = await readdir(profileDirectory)
    const fileName = files.find((name) => name.endsWith('.slide-project.json'))
    if (fileName) return join(profileDirectory, fileName)
    await delay(100)
  }
  throw new Error('Timed out while downloading the project backup.')
}

async function setEditingText(clientInstance, text) {
  await waitForExpression(
    clientInstance,
    `Boolean(document.querySelector('textarea[aria-label="文字內容"]:not([readonly])'))`,
    'text editor focus',
  )
  const changed = await evaluate(
    clientInstance,
    `(() => {
      const editor = document.querySelector(
        'textarea[aria-label="文字內容"]:not([readonly])',
      )
      if (!editor) return false
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      ).set
      valueSetter.call(editor, ${JSON.stringify(text)})
      editor.dispatchEvent(new Event('input', { bubbles: true }))
      editor.blur()
      return true
    })()`,
  )
  if (!changed) throw new Error('Could not edit slide text.')
}

async function startEditingFirstText(clientInstance) {
  const started = await evaluate(
    clientInstance,
    `(() => {
      const element = document.querySelector('.text-element')
      if (!element) return false
      element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      return true
    })()`,
  )
  if (!started) throw new Error('Could not start editing duplicated slide text.')
}

async function importGeneratedImage(clientInstance) {
  const imported = await evaluate(
    clientInstance,
    `(async () => {
      const input = document.querySelector('input[type="file"]')
      if (!input) return false
      const canvas = document.createElement('canvas')
      canvas.width = 720
      canvas.height = 260
      const context = canvas.getContext('2d')
      const gradient = context.createLinearGradient(0, 0, 720, 260)
      gradient.addColorStop(0, '#172039')
      gradient.addColorStop(1, '#4c61ff')
      context.fillStyle = gradient
      context.fillRect(0, 0, 720, 260)
      context.fillStyle = '#ffd147'
      context.fillRect(54, 36, 10, 188)
      context.fillStyle = '#ffffff'
      context.font = 'bold 44px sans-serif'
      context.fillText('Edge PDF 驗收圖片', 96, 150)
      const blob = await new Promise((resolveBlob) => canvas.toBlob(resolveBlob, 'image/png'))
      const file = new File([blob], '驗收圖片.png', { type: 'image/png' })
      const transfer = new DataTransfer()
      transfer.items.add(file)
      input.files = transfer.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    })()`,
  )
  if (!imported) throw new Error('Could not import the generated validation image.')
}

async function waitForSlideCount(clientInstance, count) {
  await waitForExpression(
    clientInstance,
    `document.querySelectorAll('button[aria-label^="投影片 "]').length === ${count}`,
    `${count} slide thumbnails`,
  )
}

async function waitForImages(clientInstance) {
  const ready = await evaluate(
    clientInstance,
    `(async () => {
      await document.fonts.ready
      const images = Array.from(document.querySelectorAll('.print-document img'))
      await Promise.all(images.map((image) => image.decode()))
      return images.every((image) => image.complete && image.naturalWidth > 0)
    })()`,
  )
  if (!ready) throw new Error('One or more print images failed to load.')
}

function readPdfEvidence(pdfBuffer) {
  const source = pdfBuffer.toString('latin1')
  const pages = source.match(/\/Type\s*\/Page\b/g)?.length ?? 0
  return { pages }
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
}
