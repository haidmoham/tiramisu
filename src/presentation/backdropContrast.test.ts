import { afterEach, describe, expect, it } from 'vitest'
import {
  BACKDROP_LIGHT_INK_ENTER,
  BACKDROP_LIGHT_INK_LEAVE,
  clearPublishedBackdropContrast,
  estimateBackdropDarkness,
  publishBackdropContrast,
  resolveBackdropInkMode,
  tokensForBackdropInk,
} from './backdropContrast'

describe('backdrop ink contrast', () => {
  afterEach(() => {
    clearPublishedBackdropContrast(document.documentElement)
  })

  it('enters light ink only at the high threshold', () => {
    expect(resolveBackdropInkMode(BACKDROP_LIGHT_INK_ENTER - 0.001, 'dark')).toBe('dark')
    expect(resolveBackdropInkMode(BACKDROP_LIGHT_INK_ENTER, 'dark')).toBe('light')
  })

  it('holds light ink in the hysteresis band and leaves at the low threshold', () => {
    expect(resolveBackdropInkMode(BACKDROP_LIGHT_INK_LEAVE + 0.001, 'light')).toBe('light')
    expect(resolveBackdropInkMode(BACKDROP_LIGHT_INK_LEAVE, 'light')).toBe('dark')
  })

  it('publishes a stable signal and reader tokens for CSS consumers', () => {
    const root = document.documentElement
    const mode = publishBackdropContrast(root, 0.7, 'dark')

    expect(mode).toBe('light')
    expect(root.style.getPropertyValue('--ambient-backdrop-darkness')).toBe('0.700')
    expect(root.style.getPropertyValue('--ambient-reader-ink')).toBe(tokensForBackdropInk('light').ink)
    expect(root.style.getPropertyValue('--ambient-reader-line-backplate')).toBe(
      tokensForBackdropInk('light').lineBackplate,
    )
    expect(root.dataset.ambientInk).toBe('light')

    publishBackdropContrast(root, 0.3, mode)
    expect(root.dataset.ambientInk).toBe('light')
    publishBackdropContrast(root, BACKDROP_LIGHT_INK_LEAVE, mode)
    expect(root.dataset.ambientInk).toBe('dark')
  })

  it('derives a bounded representative signal without pixel reads', () => {
    expect(estimateBackdropDarkness([])).toBe(0)
    expect(
      estimateBackdropDarkness([
        { x: 0.5, y: 0.5, radius: 0.4, stretch: 1, darkness: 1 },
      ]),
    ).toBeGreaterThan(BACKDROP_LIGHT_INK_ENTER)
    expect(
      estimateBackdropDarkness([
        { x: 0.5, y: 0.5, radius: 0.4, stretch: 1, darkness: 0 },
      ]),
    ).toBe(0)
  })
})
