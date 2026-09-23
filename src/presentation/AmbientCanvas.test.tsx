import { render, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('p5', () => ({
  default: class P5Mock {
    canvas = document.createElement('canvas')
    drawingContext = new Proxy({} as CanvasRenderingContext2D, {
      get(target, property) {
        if (property in target) return Reflect.get(target, property)
        if (property === 'lineCap' || property === 'lineJoin' || property === 'fillStyle' || property === 'strokeStyle' || property === 'lineWidth') return 'round'
        return () => undefined
      },
      set(target, property, value) {
        Reflect.set(target, property, value)
        return true
      },
    })
    setup?: () => void
    draw?: () => void

    constructor(sketch: (instance: P5Mock) => void, host: HTMLElement) {
      const noOperation = () => undefined
      Object.assign(this, {
        pixelDensity: noOperation,
        frameRate: noOperation,
        createCanvas: (width: number, height: number) => {
          this.canvas.width = width
          this.canvas.height = height
          host.append(this.canvas)
        },
        noLoop: noOperation,
        loop: noOperation,
        redraw: () => this.draw?.(),
        resizeCanvas: noOperation,
        clear: noOperation,
        remove: () => this.canvas.remove(),
      })

      sketch(this)
      this.setup?.()
    }
  },
}))

import { AmbientCanvas } from './AmbientCanvas'

describe('AmbientCanvas', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  })
  afterEach(() => vi.unstubAllGlobals())
  it('loads a decorative p5 canvas without taking over the content layer', async () => {
    const { container } = render(<AmbientCanvas variant="reader" />)

    await waitFor(() => expect(container.querySelector('canvas')).toHaveAttribute('aria-hidden', 'true'))
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })
})
