import type { TrackSummary } from '../domain'

/** Normalize typography while keeping version words such as live/remix intact. */
export function normalizeIdentity(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[’']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export function sameRecording(expected: Pick<TrackSummary, 'title' | 'artist'> & {
  collection?: string; durationSeconds?: number
}, actual: Pick<TrackSummary, 'title' | 'artist'> & {
  collection?: string; durationSeconds?: number
}): boolean {
  if (normalizeIdentity(expected.title) !== normalizeIdentity(actual.title)
    || normalizeIdentity(expected.artist) !== normalizeIdentity(actual.artist)) return false
  if (expected.collection && expected.collection !== 'Unknown album'
    && normalizeIdentity(expected.collection) !== normalizeIdentity(actual.collection ?? '')) return false
  if (expected.durationSeconds !== undefined
    && (actual.durationSeconds === undefined
      || Math.abs(expected.durationSeconds - actual.durationSeconds) > 2)) return false
  return true
}

export function sourceUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined
  } catch { return undefined }
}
