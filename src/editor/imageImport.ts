export const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg'])

export function validateImageFile(file: File): string | null {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    return '只支援 PNG 或 JPEG 圖片。'
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return '圖片不可超過 20 MB。'
  }
  return null
}

export async function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file)
  const size = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return size
}
