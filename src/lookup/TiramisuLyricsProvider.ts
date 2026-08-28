import type {
  LyricDocument,
  LyricsProvider,
  LyricsSearchField,
  TrackSummary,
} from '../domain'
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

  async search(
    query: string,
    signal?: AbortSignal,
    field: LyricsSearchField = 'smart',
  ): Promise<readonly TrackSummary[]> {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) return TIRAMISU_DEFAULT_TRACKS

    const primaryResults = await this.#primary.search(normalizedQuery, signal, field)
    if (primaryResults.length > 0) return rankResults(primaryResults, normalizedQuery, field)

    const response = await this.#fetch(
      new URL(`${this.#suggestUrl}${encodeURIComponent(normalizedQuery)}`),
      { method: 'GET', headers: { Accept: 'application/json' }, signal },
    )

    if (!response.ok) {
      throw new Error(`Catalog fallback failed (${response.status}).`)
    }

    const payload: unknown = await response.json()
    return rankResults(parseSuggestions(payload), normalizedQuery, field).slice(0, MAX_SUGGESTIONS)
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
  }

  return results
}

/**
 * Catalog APIs can return a broad lexical match even for a specific
 * title-and-artist query. Rank the normalized domain results so a matching
 * artist is not buried beneath title-only matches, while preserving upstream
 * order when candidates are equally relevant.
 */
function rankResults(
  results: readonly TrackSummary[],
  query: string,
  field: LyricsSearchField,
): readonly TrackSummary[] {
  const terms = searchTerms(query)
  if (terms.length === 0) return results

  return results
    .map((track, index) => ({ track, index, score: relevanceScore(track, terms, field) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ track }) => track)
}

function relevanceScore(
  track: TrackSummary,
  terms: readonly string[],
  field: LyricsSearchField,
): number {
  const titleTerms = searchTerms(track.title)
  const artistTerms = searchTerms(track.artist)
  const collectionTerms = searchTerms(track.collection)
  const weights = relevanceWeights(field)

  return terms.reduce(
    (score, term) => score
      + fieldScore(term, artistTerms, ...weights.artist)
      + fieldScore(term, titleTerms, ...weights.title)
      + fieldScore(term, collectionTerms, ...weights.collection),
    0,
  )
}

type RelevanceWeights = Record<'artist' | 'title' | 'collection', [number, number, number]>

function relevanceWeights(field: LyricsSearchField): RelevanceWeights {
  if (field === 'title') {
    return {
      artist: [16, 10, 4],
      title: [90, 65, 34],
      collection: [8, 5, 2],
    }
  }

  if (field === 'artist') {
    return {
      artist: [96, 72, 30],
      title: [16, 12, 6],
      collection: [8, 5, 2],
    }
  }

  return {
    artist: [70, 50, 20],
    title: [60, 45, 24],
    collection: [12, 8, 4],
  }
}

function fieldScore(
  term: string,
  fieldTerms: readonly string[],
  exactWeight: number,
  partialWeight: number,
  fuzzyWeight: number,
): number {
  if (fieldTerms.includes(term)) return exactWeight
  if (fieldTerms.some((fieldTerm) => fieldTerm.includes(term) || term.includes(fieldTerm))) {
    return partialWeight
  }

  const similarity = Math.max(0, ...fieldTerms.map((fieldTerm) => termSimilarity(term, fieldTerm)))
  return similarity >= 0.7 ? similarity * fuzzyWeight : 0
}

function searchTerms(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function termSimilarity(left: string, right: string): number {
  const longer = Math.max(left.length, right.length)
  if (longer === 0) return 0
  if (Math.min(left.length, right.length) < 3) return 0

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost,
      )
    }
    previous = current
  }

  return 1 - previous[right.length] / longer
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
