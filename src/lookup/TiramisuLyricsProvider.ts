import type {
  LyricDocument,
  LyricsProvider,
  LyricsSearchField,
  TrackSummary,
} from '../domain'
import { LrcLibLyricsProvider } from './LrcLibLyricsProvider'
import {
  createLrcMuxTrackSummary,
  decodeLrcMuxTrackMetadata,
  LrcMuxLyricsProvider,
  type LrcMuxTrackMetadata,
} from './LrcMuxLyricsProvider'

import { normalizeIdentity, sameRecording } from './recordingIdentity'
import { classifyLyricsFailure, RecordingMismatchError } from './lyricsFailure'

const SUGGEST_URL = 'https://api.lyrics.ovh/suggest/'
const MAX_SUGGESTIONS = 12

export const TIRAMISU_DEFAULT_TRACKS: readonly TrackSummary[] = [
  {
    id: 'lrclib:9878071',
    title: 'This Modern Love',
    artist: 'Bloc Party',
    collection: 'Bloc Party',
    source: 'lrclib',
  },
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
  /** Per-source deadline, leaving time to try an independent provider. */
  timeoutMs?: number
}

/**
 * Tiramisu's provider composition.
 *
 * LRCLIB supplies stable-ID search and lyrics. lyrics.ovh adds metadata-only
 * candidates even when LRCLIB returns broad matches, and LrcMux retrieves the
 * selected lyric document. Empty search intentionally returns the curated home
 * shelf without making a network request.
 */
export class TiramisuLyricsProvider implements LyricsProvider {
  readonly #primary: LyricsProvider
  readonly #fallback: LyricsProvider
  readonly #fetch: typeof fetch
  readonly #suggestUrl: string
  readonly #timeoutMs: number
  readonly #knownTracks = new Map(TIRAMISU_DEFAULT_TRACKS.map((track) => [track.id, track]))

  constructor({
    primary = new LrcLibLyricsProvider(),
    fallback = new LrcMuxLyricsProvider(),
    fetch: fetchImplementation,
    suggestUrl = SUGGEST_URL,
    // Three-hop saved-link recovery must fit inside the reader's 20s deadline.
    timeoutMs = 6_000,
  }: TiramisuLyricsProviderOptions = {}) {
    const resolvedFetch = fetchImplementation ?? globalThis.fetch
    if (!resolvedFetch) throw new Error('Tiramisu lookup requires a fetch implementation.')

    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2 ** 32 - 1) throw new RangeError('Provider timeout must be a positive 32-bit integer.')
    this.#timeoutMs = timeoutMs
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

    // Broad primary matches must not hide an exact recording in the other catalog.
    // Bound metadata enrichment independently so its outage cannot stall useful lyrics.
    const suggestSignal = AbortSignal.any([
      ...(signal ? [signal] : []),
      AbortSignal.timeout(5_000),
    ])
    const [primary, suggestions] = await Promise.allSettled([
      this.#primary.search(normalizedQuery, this.#requestSignal(signal), field),
      this.#searchSuggestions(normalizedQuery, suggestSignal),
    ])
    if (signal?.aborted) throw new DOMException('Search was aborted.', 'AbortError')

    const primaryResults = primary.status === 'fulfilled' ? primary.value : []
    const suggestedResults = suggestions.status === 'fulfilled' ? suggestions.value : []
    if (primaryResults.length === 0 && suggestedResults.length === 0) {
      if (primary.status === 'rejected') throw primary.reason
      if (suggestions.status === 'rejected') throw suggestions.reason
    }

    // Keep metadata, not lyric text, for independent recovery of a selected ID.
    // A bounded insertion-ordered cache also retains the previous search on Back.
    for (const track of primaryResults) {
      this.#knownTracks.set(track.id, track)
      if (this.#knownTracks.size > 100) this.#knownTracks.delete(this.#knownTracks.keys().next().value!)
    }

    const additions = suggestedResults.filter((track) => !primaryResults.some((primary) => sameRecording(track, primary)))
    return rankResults([...primaryResults, ...additions], normalizedQuery, field)
      .slice(0, Math.max(primaryResults.length, MAX_SUGGESTIONS))
  }

  async #searchSuggestions(query: string, signal: AbortSignal): Promise<readonly TrackSummary[]> {
    const response = await this.#fetch(
      new URL(`${this.#suggestUrl}${encodeURIComponent(query)}`),
      { method: 'GET', headers: { Accept: 'application/json' }, signal },
    )
    if (!response.ok) throw new Error(`Catalog fallback failed (${response.status}).`)
    // Rank the entire response before applying the display limit. Alice by Cherry
    // currently occurs after the first twelve metadata suggestions upstream.
    const payload: unknown = await response.json()
    return parseSuggestions(payload)
  }

  async getLyrics(id: string, signal?: AbortSignal): Promise<LyricDocument> {
    if (id.startsWith('lrclib:')) {
      try {
        return await this.#primary.getLyrics(id, this.#requestSignal(signal))
      } catch (error) {
        signal?.throwIfAborted()
        const kind = classifyLyricsFailure(error).kind
        const expected = this.#knownTracks.get(id)
        if (!expected || (kind !== 'provider-unavailable' && kind !== 'not-found')) throw error

        // Metadata from the selected search result lets the independent source
        // verify the same recording. Never loosen album/version/duration checks.
        const fallback = createLrcMuxTrackSummary({
          title: expected.title,
          artist: expected.artist,
          album: expected.collection === 'Unknown album' ? undefined : expected.collection,
          duration: expected.durationSeconds,
        })
        try {
          const document = await this.#fallback.getLyrics(fallback.id, this.#requestSignal(signal))
          signal?.throwIfAborted()
          if (!sameRecording(expected, document.track)) throw new RecordingMismatchError()
          return document
        } catch (recoveryError) {
          signal?.throwIfAborted()
          // A miss in the backup catalog does not prove the unavailable source
          // lacks this recording. Keep the original availability failure.
          if (kind === 'provider-unavailable' && classifyLyricsFailure(recoveryError).kind === 'not-found') throw error
          throw recoveryError
        }
      }
    }
    if (id.startsWith('lrcmux:')) {
      try {
        return await this.#fallback.getLyrics(id, this.#requestSignal(signal))
      } catch (error) {
        signal?.throwIfAborted()
        const kind = classifyLyricsFailure(error).kind
        if (kind !== 'not-found' && kind !== 'provider-unavailable') throw error

        // Saved links can outlive a catalog entry or a source outage. Try the
        // independent catalog without substituting a different recording.
        const metadata = decodeLrcMuxTrackMetadata(id)
        try {
          const candidates = await this.#primary.search(`${metadata.title} ${metadata.artist}`, this.#requestSignal(signal))
          const expected = createLrcMuxTrackSummary(metadata)
          const matches = candidates.filter((candidate) => sameRecording(expected, candidate))
          if (matches.length > 1) throw new RecordingMismatchError()
          if (matches.length === 0) throw error
          const document = await this.#primary.getLyrics(matches[0].id, this.#requestSignal(signal))
          signal?.throwIfAborted()
          if (!sameRecording(expected, document.track)) throw new RecordingMismatchError()
          return document
        } catch (recoveryError) {
          signal?.throwIfAborted()
          if (kind === 'provider-unavailable' && classifyLyricsFailure(recoveryError).kind === 'not-found') throw error
          throw recoveryError
        }
      }
    }
    throw new Error('Unknown lyrics source in track ID.')
  }

  #requestSignal(signal?: AbortSignal): AbortSignal {
    return AbortSignal.any([
      ...(signal ? [signal] : []),
      AbortSignal.timeout(this.#timeoutMs),
    ])
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

    const key = JSON.stringify([
      normalizeIdentity(metadata.artist), normalizeIdentity(metadata.title),
      normalizeIdentity(metadata.album ?? ''), metadata.duration ?? null,
    ])
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
    .map((track, index) => ({ track, index, score: relevanceScore(track, terms, field)
      + exactIdentityScore(track, terms) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ track }) => track)
}

function exactIdentityScore(track: TrackSummary, terms: readonly string[]): number {
  const query = terms.join(' ')
  const title = searchTerms(track.title).join(' ')
  const artist = searchTerms(track.artist).join(' ')
  // Repeated query terms across title, artist and album must not outrank the
  // exact title-and-artist pair merely by accumulating lexical points.
  return query === `${title} ${artist}` || query === `${artist} ${title}` ? 1_000 : 0
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
    .replace(/\p{M}/gu, '')
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
