import { useEffect, useState } from 'react'
import type { ImageFit, ImagePosition } from '../model/presentation'
import { loadAsset } from '../storage/presentationDb'

interface AssetImageProps {
  assetId: string
  alt: string
  fit?: ImageFit
  position?: ImagePosition
}

export function AssetImage({ assetId, alt, fit, position }: AssetImageProps) {
  const [assetState, setAssetState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; url: string }
    | { status: 'error' }
  >({ status: 'loading' })

  useEffect(() => {
    let disposed = false
    let objectUrl: string | undefined

    void loadAsset(assetId)
      .then((asset) => {
        if (!asset) throw new Error('Image asset not found.')
        objectUrl = URL.createObjectURL(asset.blob)
        if (disposed) {
          URL.revokeObjectURL(objectUrl)
          return
        }
        setAssetState({ status: 'ready', url: objectUrl })
      })
      .catch(() => {
        if (!disposed) setAssetState({ status: 'error' })
      })

    return () => {
      disposed = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [assetId])

  if (assetState.status === 'ready') {
    return (
      <img
        src={assetState.url}
        alt={alt}
        draggable={false}
        style={{ objectFit: fit ?? 'contain', objectPosition: position ?? 'center' }}
      />
    )
  }

  return (
    <div className={`image-placeholder is-${assetState.status}`}>
      {assetState.status === 'error' ? '圖片無法載入' : '正在載入圖片'}
    </div>
  )
}
