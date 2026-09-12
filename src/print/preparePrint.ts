const ASSET_WAIT_TIMEOUT_MS = 5000

export async function preparePrint(root: ParentNode): Promise<void> {
  if (document.fonts) await document.fonts.ready

  const deadline = performance.now() + ASSET_WAIT_TIMEOUT_MS
  while (root.querySelector('.image-placeholder.is-loading')) {
    if (performance.now() >= deadline) {
      throw new Error('Timed out while preparing images for print.')
    }
    await new Promise((resolve) => window.setTimeout(resolve, 25))
  }

  const images = Array.from(root.querySelectorAll('img'))
  await Promise.allSettled(images.map((image) => image.decode()))
}
