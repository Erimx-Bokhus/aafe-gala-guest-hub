// Compatibility for older Safari / iPad versions (opened from file:// or old iPadOS).
const g = globalThis as unknown as { structuredClone?: <T>(v: T) => T }
if (typeof g.structuredClone !== 'function') g.structuredClone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
if (!Array.prototype.at) {
  Object.defineProperty(Array.prototype, 'at', { configurable: true, writable: true, value: function <T>(this: T[], i: number) { const n = Math.trunc(i) || 0; return this[n < 0 ? this.length + n : n] } })
}
if (!window.matchMedia) (window as unknown as { matchMedia: unknown }).matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })

// Never show a blank page: if anything fails, show a readable message instead.
function showError(msg: string) {
  const root = document.getElementById('root')
  if (root && !root.querySelector('[data-app-ready]')) {
    root.innerHTML = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:80px auto;padding:24px;border:1px solid #DFE5EE;border-radius:0;color:#101A2C;line-height:1.5"><strong style="color:#C64C27">The app could not start in this browser.</strong><br/>Please try the latest Safari or Chrome, or use the online preview link.<br/><br/><code style="font-size:12px;color:#4B5E7C">${msg.replace(/</g, '&lt;')}</code></div>`
  }
}
window.addEventListener('error', (e) => showError(e.message || 'Unknown error'))
window.addEventListener('unhandledrejection', (e) => showError(String((e as PromiseRejectionEvent).reason)))
export {}
