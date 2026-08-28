import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ResultSymbolToy } from './ResultSymbolToy'

describe('ResultSymbolToy', () => {
  it('is decorative and retargets its symbols from pointer movement', () => {
    const { container } = render(<ResultSymbolToy seed="track-2" />)
    const toy = container.querySelector('.result-symbol-toy') as HTMLSpanElement
    const orbit = container.querySelector('.result-symbol-toy__orbit') as SVGGElement

    expect(toy).toHaveAttribute('aria-hidden', 'true')
    expect(toy.querySelector('svg')).toHaveAttribute('role', 'presentation')

    fireEvent.pointerMove(toy, { clientX: 84, clientY: 16, pointerType: 'mouse' })
    expect(orbit.style.transform).toContain('translate')

    fireEvent.pointerLeave(toy)
    expect(orbit.style.transform).toBe('')
  })

  it('uses the seed to keep its visual variant stable', () => {
    const first = render(<ResultSymbolToy seed="same-track-3" />)
    const second = render(<ResultSymbolToy seed="same-track-3" />)

    expect(first.container.firstElementChild).toHaveAttribute(
      'data-variant',
      second.container.firstElementChild?.getAttribute('data-variant'),
    )
  })
})
