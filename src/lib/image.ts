// Achica y comprime una imagen en el navegador antes de subirla, para no
// gastar de más el espacio de almacenamiento (Supabase Storage). Se usa
// tanto para fotos de producto como, más adelante, para fotos de factura.
//
// No manda nada a ningún lado: todo el trabajo pasa en la compu/celu de
// quien está cargando la foto, usando un <canvas> (nada de librerías
// externas, nada de red).

export interface CompressImageOptions {
  /** Lado más largo en píxeles al que se achica la imagen. */
  maxDimension?: number
  /** Calidad de compresión JPEG, de 0 a 1. */
  quality?: number
}

/**
 * Devuelve una copia comprimida del archivo como JPEG. Si por algún motivo
 * el navegador no puede procesarla (formato raro, etc.), devuelve el
 * archivo original tal cual, para no bloquear la carga.
 */
export async function compressImage(
  file: File,
  { maxDimension = 1280, quality = 0.8 }: CompressImageOptions = {}
): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    const blob: Blob | null = await new Promise(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    )
    if (!blob) return file

    // Si por alguna razón la "compresión" dio un archivo más pesado que el
    // original (pasa con imágenes ya muy chicas o muy comprimidas), nos
    // quedamos con el original.
    if (blob.size >= file.size) return file

    const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], newName, { type: 'image/jpeg' })
  } catch (err) {
    console.error('No se pudo comprimir la imagen, se sube el original:', err)
    return file
  }
}
