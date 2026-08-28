import type { LyricDocument, LyricsProvider, TrackSummary } from '../domain'
import { LrcLibLyricsProvider } from './LrcLibLyricsProvider'
import {
  createLrcMuxTrackSummary,
  LrcMuxLyricsProvider,
  type LrcMuxTrackMetadata,
} from './LrcMuxLyricsProvider'

const SUGGEST_URL = 'https://api.lyrics.ovh/suggest/'
const MAX_SUGGESTIONS = 12

export const TIRAMISU_DEFAULT_TRACKS: readonly TrackSummary[] = [
  createLrcMuxTrackSummary({
    title: 'This Modern Love',
    artist: 'Bloc Party',
    album: 'Silent Alarm',
    duration: 266,
  }),
  createLrcMuxTrackSummary({
    title: 'Melancholy',
    artist: 'Driveways',
    album: 'Melancholy',
    duration: 173,
  }),
  createLrcMuxTrackSummary({
    title: 'cbd',
    artist: 'brakence',
    album: 'hypochondriac',
    duration: 159,
  }),
]

export interface TiramisuLyricsProviderOptions {
  primary?: LyricsProvider
  fallback?: LyricsProvider
  fetch?: typeof fetch
  suggestUrl?: string
}

/**
 * Tiramisu's provider composition.
 *
 * LRCLIB supplies stable-ID search and lyrics first. When it has no catalog
 * match, lyrics.ovh supplies metadata-only candidates and LrcMux retrieves the
 * selected lyric document. Empty search intentionally returns the curated home
 * shelf without making a network request.
 */
export class TiramisuLyricsProvider implements LyricsProvider {
  readonly #primary: LyricsProvider
  readonly #fallback: LyricsProvider
  readonly #fetch: typeof fetch
  readonly #suggestUrl: string

  constructor({
    primary = new LrcLibLyricsProvider(),
    fallback = new LrcMuxLyricsProvider(),
    fetch: fetchImplementation,
    suggestUrl = SUGGEST_URL,
  }: TiramisuLyricsProviderOptions = {}) {
    const resolvedFetch = fetchImplementation ?? globalThis.fetch
    if (!resolvedFetch) throw new Error('Tiramisu lookup requires a fetch implementation.')

    this.#primary = primary
    this.#fallback = fallback
    this.#fetch = fetchImplementation ?? resolvedFetch.bind(globalThis)
    this.#suggestUrl = suggestUrl.endsWith('/') ? suggestUrl : `${suggestUrl}/`
  }

  async search(query: string, signal?: AbortSignal): Promise<readonly TrackSummary[]> {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) return TIRAMISU_DEFAULT_TRACKS

    const primaryResults = await this.#primary.search(normalizedQuery, signal)
    if (primaryResults.length > 0) return primaryResults

    const response = await this.#fetch(
      new URL(`${this.#suggestUrl}${encodeURIComponent(normalizedQuery)}`),
      { method: 'GET', headers: { Accept: 'application/json' }, signal },
    )

    if (!response.ok) {
      throw new Error(`Catalog fallback failed (${response.status}).`)
    }

    const payload: unknown = await response.json()
    return parseSuggestions(payload)
  }

  async getLyrics(id: string, signal?: AbortSignal): Promise<LyricDocument> {
    if (id.startsWith('lrclib:')) return this.#primary.getLyrics(id, signal)
    if (id.startsWith('lrcmux:')) return this.#fallback.getLyrics(id, signal)
    throw new Error('Unknown lyrics source in track ID.')
  }
}

function parseSuggestions(payload: unknown): readonly TrackSummary[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error('Catalog fallback returned an invalid response.')
  }

  const seen = new Set<string>()
  const results: TrackSummary[] = []

  for (const candidate of payload.data) {
    const metadata = parseSuggestion(candidate)
    if (!metadata) continue

    const key = `${metadata.artist}\u0000${metadata.title}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    results.push(createLrcMuxTrackSummary(metadata))
    if (results.length === MAX_SUGGESTIONS) break
  }

  return results
}

function parseSuggestion(candidate: unknown): LrcMuxTrackMetadata | null {
  if (!isRecord(candidate) || !isRecord(candidate.artist)) return null
  if (typeof candidate.title !== 'string' || typeof candidate.artist.name !== 'string') return null

  const title = candidate.title.trim()
  const artist = candidate.artist.name.trim()
  if (!title || !artist) return null

  const album = isRecord(candidate.album) && typeof candidate.album.title === 'string'
    ? candidate.album.title.trim() || undefined
    : undefined
  const duration = typeof candidate.duration === 'number' && Number.isFinite(candidate.duration)
    ? candidate.duration
    : undefined

  return { title, artist, album, duration }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
