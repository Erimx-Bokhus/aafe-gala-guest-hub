// Reading QR codes from the iPad camera. Safari (and every browser on iPad and iPhone, which all use Safari's
// engine) has no built-in QR reader (BarcodeDetector), so jsQR reads each camera frame instead. Where a browser
// does have the built-in reader (some Android and desktop Chrome), that is used, since it's a little faster.
import jsQR from 'jsqr'

/** The text of the QR code in one picture, or null. `data` is RGBA pixels, `width` x `height`. */
export function decodePixels(data: Uint8ClampedArray, width: number, height: number): string | null {
  return jsQR(data, width, height, { inversionAttempts: 'dontInvert' })?.data || null
}

type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }

/** A reader for video frames: the built-in one if this browser has it, otherwise jsQR. */
export function frameReader(): (video: HTMLVideoElement) => Promise<string | null> {
  const BD = (window as unknown as { BarcodeDetector?: new (o: object) => Detector }).BarcodeDetector
  if (BD) {
    try {
      const det = new BD({ formats: ['qr_code'] })
      return async (v) => (await det.detect(v))[0]?.rawValue ?? null
    } catch { /* this browser lists it but can't read QR codes: use jsQR */ }
  }
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  return async (v) => {
    if (!ctx || !v.videoWidth) return null
    // A smaller copy reads faster and is plenty for a ticket held up to the camera.
    const scale = Math.min(1, 640 / v.videoWidth)
    canvas.width = Math.round(v.videoWidth * scale); canvas.height = Math.round(v.videoHeight * scale)
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
    return decodePixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)
  }
}

/** Ignores the same code read again within `ms` (the camera sees a ticket many times a second). */
export function onceEvery(ms: number, now: () => number = Date.now) {
  let last = '', at = -Infinity
  return (code: string) => {
    if (code === last && now() - at < ms) return false
    last = code; at = now()
    return true
  }
}
