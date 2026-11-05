/** Downscale a photo to keep IndexedDB small (max 1280px, JPEG 0.8). */
export async function compressImage(file: File, max = 1280): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale)
  c.height = Math.round(bmp.height * scale)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.8))
}
