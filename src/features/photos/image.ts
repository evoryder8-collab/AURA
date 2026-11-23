/** Longest edge of a saved progress photo, in pixels. */
export const MAX_PHOTO_EDGE = 1280
export const PHOTO_QUALITY = 0.8
/** Camera frames are centre-cropped to the 3:4 portrait viewfinder, so what you see is what is saved. */
export const VIEWFINDER_ASPECT = 3 / 4

/**
 * Draws an image or video frame onto a canvas no larger than 1280px on its longest edge,
 * optionally centre-cropped to `aspect` (width / height), and returns a JPEG data URL.
 */
export function frameToJpeg(
  source: CanvasImageSource,
  width: number,
  height: number,
  aspect?: number,
): string | null {
  if (!width || !height) return null
  let sx = 0
  let sy = 0
  let sw = width
  let sh = height
  if (aspect) {
    if (width / height > aspect) {
      sw = Math.round(height * aspect)
      sx = Math.round((width - sw) / 2)
    } else {
      sh = Math.round(width / aspect)
      sy = Math.round((height - sh) / 2)
    }
  }
  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(sw, sh))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sw * scale))
  canvas.height = Math.max(1, Math.round(sh * scale))
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', PHOTO_QUALITY)
}

/** Decodes a chosen file (EXIF orientation applied by the browser) and downscales it. */
export async function fileToJpeg(file: Blob): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('The image could not be read.'))
      image.src = url
    })
    const dataUrl = frameToJpeg(image, image.naturalWidth, image.naturalHeight)
    if (!dataUrl) throw new Error('The image could not be read.')
    return dataUrl
  } finally {
    URL.revokeObjectURL(url)
  }
}
