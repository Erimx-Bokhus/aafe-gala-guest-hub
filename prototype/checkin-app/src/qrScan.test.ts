import QRCode from 'qrcode'
import { describe, expect, it } from 'vitest'
import { decodePixels, onceEvery } from './qrScan'

// A QR e-ticket drawn as a camera would see it: black modules on white, with a quiet border. Invented code.
function ticketPixels(text: string, scale = 6, border = 4) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size, size = (n + border * 2) * scale
  const px = new Uint8ClampedArray(size * size * 4).fill(255)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!qr.modules.get(y, x)) continue
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const i = (((y + border) * scale + dy) * size + (x + border) * scale + dx) * 4
      px[i] = px[i + 1] = px[i + 2] = 0
    }
  }
  return { px, size }
}

describe('reading QR tickets without Safari’s missing built-in reader', () => {
  it('reads an AAFE e-ticket code from camera pixels', () => {
    const code = 'AAFE-0123456789ABCDEF0123456789ABCDEF'
    const { px, size } = ticketPixels(code)
    expect(decodePixels(px, size, size)).toBe(code)
  })

  it('returns nothing for a picture with no QR code', () => {
    expect(decodePixels(new Uint8ClampedArray(200 * 200 * 4).fill(255), 200, 200)).toBeNull()
  })

  it('reads the same ticket once, not again and again while it stays in view', () => {
    let t = 0
    const fresh = onceEvery(3000, () => t)
    expect(fresh('AAFE-1')).toBe(true)
    t = 200; expect(fresh('AAFE-1')).toBe(false)
    t = 400; expect(fresh('AAFE-2')).toBe(true)
    t = 3000; expect(fresh('AAFE-2')).toBe(false)   // 2.6 seconds after it was read
    t = 3400; expect(fresh('AAFE-2')).toBe(true)    // 3 seconds later it counts again
  })
})
