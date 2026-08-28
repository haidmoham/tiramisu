/**
 * A normalized estimate of how dark the rendered backdrop is behind the
 * reading column. Larger values mean that light ink is more useful.
 */
export type BackdropInkMode = 'dark' | 'light'

export const BACKDROP_LIGHT_INK_ENTER = 0.42
export const BACKDROP_LIGHT_INK_LEAVE = 0.24

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

/**
 * Keep the ink decision stable while the animated field crosses a threshold.
 * The two thresholds intentionally leave a quiet band between enter and exit.
 */
export function resolveBackdropInkMode(
  darkness: number,
  currentMode: BackdropInkMode,
): BackdropInkMode {
  const signal = clamp(darkness, 0, 1)
  if (currentMode === 'dark' && signal >= BACKDROP_LIGHT_INK_ENTER) return 'light'
  if (currentMode === 'light' && signal <= BACKDROP_LIGHT_INK_LEAVE) return 'dark'
  return currentMode
}

export interface BackdropContrastBlob {
  x: number
  y: number
  radius: number
  stretch: number
  darkness: number
}

const CONTRAST_SAMPLES = [
  { x: 0.38, y: 0.2 },
  { x: 0.5, y: 0.38 },
  { x: 0.62, y: 0.56 },
  { x: 0.44, y: 0.74 },
  { x: 0.56, y: 0.9 },
] as const

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Estimate darkness using the same blob positions that drive the shader.
 * This samples a handful of normalized points in CPU state; it never reads
 * pixels from the canvas or queries layout.
 */
export function estimateBackdropDarkness(blobs: readonly BackdropContrastBlob[]) {
  let sampledDarkness = 0
  let sampleCount = 0

  CONTRAST_SAMPLES.forEach((sample) => {
    let total = 0
    let weightedDarkness = 0

    blobs.forEach((blob) => {
      const dx = sample.x - blob.x
      const dy = sample.y - blob.y
      const density = (blob.radius * blob.radius * blob.stretch) / (dx * dx + dy * dy + 0.016)
      total += density
      weightedDarkness += density * clamp(blob.darkness, 0, 1)
    })

    if (total === 0) return
    // Match the shader's soft merge: isolated blobs should not make the whole
    // reader switch ink, while a merged dark pocket should influence it.
    const coverage = smoothstep(0.82, 2.2, total)
    const pigmentDarkness = weightedDarkness / total
    sampledDarkness += coverage * pigmentDarkness
    sampleCount += 1
  })

  const representativeDarkness = sampleCount ? sampledDarkness / sampleCount : 0
  // Give a genuinely dark pocket enough weight to cross the enter threshold
  // without allowing a mostly-paper field to switch all copy to light ink.
  return clamp(Math.pow(representativeDarkness, 0.75), 0, 1)
}

export interface AmbientReaderTokens {
  ink: string
  muted: string
  glass: string
  glassBorder: string
  lineBackplate: string
}

export function tokensForBackdropInk(mode: BackdropInkMode): AmbientReaderTokens {
  if (mode === 'light') {
    return {
      ink: '#fff7df',
      muted: '#d8d5ff',
      glass: 'rgb(21 16 68 / 78%)',
      glassBorder: 'rgb(255 247 223 / 38%)',
      lineBackplate: 'rgb(21 16 68 / 84%)',
    }
  }

  return {
    ink: '#151044',
    muted: '#403a67',
    glass: 'linear-gradient(to bottom, rgb(255 247 223 / 42%), rgb(255 247 223 / 30%) 72%, rgb(255 247 223 / 20%))',
    glassBorder: 'rgb(255 255 255 / 24%)',
    lineBackplate: 'rgb(255 247 223 / 84%)',
  }
}

/** Publish the signal and the current stable presentation target to CSS. */
export function publishBackdropContrast(
  root: HTMLElement,
  darkness: number,
  currentMode: BackdropInkMode,
) {
  const mode = resolveBackdropInkMode(darkness, currentMode)
  const tokens = tokensForBackdropInk(mode)
  const style = root.style
  style.setProperty('--ambient-backdrop-darkness', clamp(darkness, 0, 1).toFixed(3))
  style.setProperty('--ambient-reader-ink', tokens.ink)
  style.setProperty('--ambient-reader-muted', tokens.muted)
  style.setProperty('--ambient-reader-glass', tokens.glass)
  style.setProperty('--ambient-reader-glass-border', tokens.glassBorder)
  style.setProperty('--ambient-reader-line-backplate', tokens.lineBackplate)
  root.dataset.ambientInk = mode
  return mode
}

export function clearPublishedBackdropContrast(root: HTMLElement) {
  root.style.removeProperty('--ambient-backdrop-darkness')
  root.style.removeProperty('--ambient-reader-ink')
  root.style.removeProperty('--ambient-reader-muted')
  root.style.removeProperty('--ambient-reader-glass')
  root.style.removeProperty('--ambient-reader-glass-border')
  root.style.removeProperty('--ambient-reader-line-backplate')
  delete root.dataset.ambientInk
}
