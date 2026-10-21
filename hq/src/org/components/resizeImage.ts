/** A picture chosen from disk, scaled down to fit and encoded as a JPEG data URL, as an agent's images are. */
export function resizeImage(file: File, maxW: number, maxH: number, minSide = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      if (Math.min(img.width, img.height) < minSide) {
        URL.revokeObjectURL(url)
        reject(new Error(`That image is too small. Choose one at least ${minSide}×${minSide}.`))
        return
      }
      const scale = Math.min(maxW / img.width, maxH / img.height, 1)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.88))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a picture')) }
    img.src = url
  })
}

export const PICTURE_SIZE = { avatar: [256, 256], cover: [1200, 400] } as const

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp']

/** Why a chosen file cannot be used, checked before anything is sent; null when it can. */
export function imageFileProblem(file: File): string | null {
  if (!UPLOAD_TYPES.includes(file.type)) return 'Choose a PNG, JPG or WebP image.'
  if (file.size > MAX_UPLOAD_BYTES) return 'That image is over 10 MB. Choose a smaller one.'
  return null
}
