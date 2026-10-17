import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import '../i18n'

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

// APIs del navegador que jsdom no trae.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
}
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
URL.createObjectURL ??= vi.fn(() => 'blob:preview')
URL.revokeObjectURL ??= vi.fn()
window.print = vi.fn()
// jsdom no calcula tamaños; la lista virtual necesita un alto para dibujar filas.
Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => 600 })
Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get: () => 800 })
