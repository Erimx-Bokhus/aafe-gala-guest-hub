import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export function QR({ value, size = 120, className = '' }: { value: string; size?: number; className?: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => { QRCode.toDataURL(value, { margin: 1, width: size * 2, color: { dark: '#000000', light: '#FFFFFF' } }).then(setSrc).catch(() => setSrc('')) }, [value, size])
  return src ? <img src={src} width={size} height={size} alt={`QR code ${value}`} className={`rounded bg-white ${className}`} /> : <div style={{ width: size, height: size }} className="rounded bg-navy-50" />
}
