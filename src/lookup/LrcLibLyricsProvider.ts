import type {
  LyricDocument,
  LyricsProvider,
  TrackSummary,
} from '../domain'

const DEFAULT_BASE_URL = 'https://lrclib.net/api/'
const LRCLIB_ID_PREFIX = 'lrclib:'
const LRCLIB_CLIENT = 'tiramisu/0.1 (https://github.com/haidmoham/tiramisu)'
export const DEFAULT_LRCLIB_RESULT_COUNT = 20
const MAX_LRCLIB_RESULT_COUNT = 50

/** Options for the network-backed LRCLIB adapter. */
export interface LrcLibLyricsProviderOptions {
  /** Injectable fetch implementation for tests or an application transport. */
  fetch?: typeof fetch
  /** Useful for tests; production callers should use the default LRCLIB URL. */
  baseUrl?: string
  /** Maximum number of summaries returned from one search. Capped at 50. */
  maxResults?: number
}

/** A non-2xx response from LRCLIB. */
export class LrcLibRequestError extends Error {
  readonly status: number

  constructor(status: number, statusText = '') {
    const suffix = statusText.trim() ? ` ${statusText.trim()}` : ''
    super(`LRCLIB request failed (${status}${suffix}).`)
    this.name = 'LrcLibRequestError'
    this.status = status
  }
}

/** A response that does not match the LRCLIB JSON contract. */
export class LrcLibPayloadError extends Error {
  constructor(message: string) {
    super(`Invalid LRCLIB response: ${message}`)
    this.name = 'LrcLibPayloadError'
  }
}

/** A valid LRCLIB track that has no readable lyric lines. */
export class LrcLibLyricsUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LrcLibLyricsUnavailableError'
  }
}

interface LrcLibResult {
  id: string
  trackName: string
  artistName: string
  albumName: string | null
  instrumental: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
}

/**
 * LyricsProvider implementation for LRCLIB's public API.
 *
 * The provider deliberately keeps the API response private: consumers receive
 * only the domain summary/document shapes and lyric text is split into lines at
 * this boundary.
 */
export class LrcLibLyricsProvider implements LyricsProvider {
  readonly #fetch: typeof fetch
  readonly #baseUrl: string
  readonly #maxResults: number

  constructor({
    fetch: fetchImplementation,
    baseUrl = DEFAULT_BASE_URL,
    maxResults = DEFAULT_LRCLIB_RESULT_COUNT,
  }: LrcLibLyricsProviderOptions = {}) {
    const resolvedFetch = fetchImplementation ?? globalThis.fetch
    if (!resolvedFetch) {
      throw new Error('LRCLIB requires a fetch implementation.')
    }

    if (!Number.isInteger(maxResults) || maxResults < 1) {
      throw new RangeError('LRCLIB maxResults must be a positive integer.')
    }

    this.#fetch = fetchImplementation ?? resolvedFetch.bind(globalThis)
    this.#baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
    this.#maxResults = Math.min(maxResults, MAX_LRCLIB_RESULT_COUNT)
  }

  async search(query: string, signal?: AbortSignal): Promise<readonly TrackSummary[]> {
    throwIfAborted(signal)

    const url = this.#url('search')
    url.searchParams.set('q', query.trim())
    const payload = await this.#requestJson(url, signal)

    if (!Array.isArray(payload)) {
      throw new LrcLibPayloadError('search response must be an array.')
    }

    return payload
      .map((entry, index) => parseResult(entry, `search result ${index}`))
      .slice(0, this.#maxResults)
      .map(toTrackSummary)
  }

  async getLyrics(id: string, signal?: AbortSignal): Promise<LyricDocument> {
    throwIfAborted(signal)
    const stableId = parsePublicId(id)
    const payload = await this.#requestJson(this.#url(`get/${encodeURIComponent(stableId)}`), signal)
    const result = parseResult(payload, 'track response')

    if (result.instrumental) {
      throw new LrcLibLyricsUnavailableError(
        `"${result.trackName}" is instrumental and has no lyrics.`,
      )
    }

    const lines = normalizePlainLyrics(result.plainLyrics)
    const normalizedLines = lines.length > 0 ? lines : normalizeSyncedLyrics(result.syncedLyrics)
    if (normalizedLines.length === 0) {
      throw new LrcLibLyricsUnavailableError(
        `LRCLIB returned no lyrics for "${result.trackName}".`,
      )
    }

    return {
      track: toTrackSummary(result),
      lines: normalizedLines.map((text, index) => ({ id: String(index + 1), text })),
    }
  }

  #url(path: string): URL {
    return new URL(path, this.#baseUrl)
  }

  async #requestJson(url: URL, signal?: AbortSignal): Promise<unknown> {
    throwIfAborted(signal)
    const response = await this.#fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Lrclib-Client': LRCLIB_CLIENT,
      },
      signal,
    })
    throwIfAborted(signal)

    if (!response.ok) {
      throw new LrcLibRequestError(response.status, response.statusText ?? '')
    }

    try {
      return await response.json()
    } catch (error) {
      if (isAbortError(error)) throw error
      throw new LrcLibPayloadError('response body was not valid JSON.')
    }
  }
}

function toTrackSummary(result: LrcLibResult): TrackSummary {
  return {
    id: `${LRCLIB_ID_PREFIX}${result.id}`,
    title: result.trackName,
    artist: result.artistName,
    collection: result.albumName?.trim() || 'Unknown album',
    source: 'lrclib',
  }
}

function parsePublicId(value: string): string {
  if (!value.startsWith(LRCLIB_ID_PREFIX)) {
    throw new LrcLibPayloadError('track ID must use the lrclib namespace.')
  }

  return parseId(value.slice(LRCLIB_ID_PREFIX.length), 'track ID')
}

function parseResult(value: unknown, location: string): LrcLibResult {
  if (!isRecord(value)) {
    throw new LrcLibPayloadError(`${location} must be an object.`)
  }

  const id = parseId(value.id, `${location}.id`)
  const trackName = parseRequiredString(value.trackName, `${location}.trackName`)
  const artistName = parseRequiredString(value.artistName, `${location}.artistName`)
  const albumName = parseNullableString(value.albumName, `${location}.albumName`)
  const instrumental = parseOptionalBoolean(value.instrumental, `${location}.instrumental`) ?? false
  const plainLyrics = parseNullableString(value.plainLyrics, `${location}.plainLyrics`)
  const syncedLyrics = parseNullableString(value.syncedLyrics, `${location}.syncedLyrics`)

  return { id, trackName, artistName, albumName, instrumental, plainLyrics, syncedLyrics }
}

function parseId(value: unknown, location: string): string {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return String(value)
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return value.trim()
  }

  throw new LrcLibPayloadError(`${location} must be a non-negative integer ID.`)
}

function parseRequiredString(value: unknown, location: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new LrcLibPayloadError(`${location} must be a non-empty string.`)
  }
  return value.trim()
}

function parseNullableString(value: unknown, location: string): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') {
    throw new LrcLibPayloadError(`${location} must be a string or null.`)
  }
  return value
}

function parseOptionalBoolean(value: unknown, location: string): boolean | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'boolean') {
    throw new LrcLibPayloadError(`${location} must be a boolean.`)
  }
  return value
}

function normalizePlainLyrics(value: string | null): string[] {
  if (!value) return []
  return splitSemanticLines(value)
}

function normalizeSyncedLyrics(value: string | null): string[] {
  if (!value) return []

  // LRCLIB uses [mm:ss.xx], while accepting an optional hour component keeps
  // this tolerant of valid LRC produced by other clients.
  const timestamp = /\[\d{1,3}:\d{2}(?::\d{2})?(?:[.:]\d{1,3})?\]/g
  const metadata = /^\s*\[[a-z][a-z\d_-]*:[^\]]*\]\s*/i

  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(timestamp, '').replace(metadata, '').trim())
    .filter(Boolean)
}

function splitSemanticLines(value: string): string[] {
  return value
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  throw abortError()
}

function abortError(): Error {
  const error = new Error('The LRCLIB request was aborted.')
  error.name = 'AbortError'
  return error
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === 'AbortError'
}
