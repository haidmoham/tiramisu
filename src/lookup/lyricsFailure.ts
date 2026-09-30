import { LrcLibLyricsUnavailableError, LrcLibRequestError } from './LrcLibLyricsProvider'
import { LrcMuxLyricsUnavailableError, LrcMuxRequestError } from './LrcMuxLyricsProvider'

export type LyricsFailureKind = 'not-found' | 'instrumental' | 'restricted' | 'ambiguous' | 'provider-unavailable'
export interface LyricsFailure { kind: LyricsFailureKind; retryAt?: number }

export class RecordingMismatchError extends Error {
  constructor() { super('The source could not confirm this recording.'); this.name = 'RecordingMismatchError' }
}

export function retryAfterTime(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  const time = /^\d+(?:\.\d+)?$/.test(value.trim()) ? now + seconds * 1000 : Date.parse(value)
  return Number.isFinite(time) && time > now ? time : undefined
}

export function classifyLyricsFailure(error: unknown): LyricsFailure {
  if (error instanceof RecordingMismatchError) return {kind: 'ambiguous'}
  if (error instanceof LrcLibLyricsUnavailableError || error instanceof LrcMuxLyricsUnavailableError) {
    return {kind: error.reason}
  }
  if (error instanceof LrcLibRequestError || error instanceof LrcMuxRequestError) {
    if (error.status === 404) return {kind: 'not-found'}
    if (error.status === 401 || error.status === 403 || error.status === 451) return {kind: 'restricted'}
    return {kind: 'provider-unavailable', retryAt: retryAfterTime(error.retryAfter)}
  }
  return {kind: 'provider-unavailable'}
}
