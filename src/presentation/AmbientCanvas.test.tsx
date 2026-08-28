import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('three', () => ({
  WebGLRenderer: class {
    constructor() {
      throw new Error('WebGL unavailable')
    }
  },
}))

import { AmbientCanvas } from './AmbientCanvas'

describe('AmbientCanvas fallback', () => {
  it('reports unavailable WebGL without taking over the content layer', async () => {
    const onFallback = vi.fn()

    const { container } = render(<AmbientCanvas onFallback={onFallback} />)

    await waitFor(() => expect(onFallback).toHaveBeenCalledWith('webgl-unavailable'))
    expect(container.querySelector('canvas')).toHaveAttribute('aria-hidden', 'true')
  })
})
