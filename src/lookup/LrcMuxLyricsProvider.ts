import type {
  LyricDocument,
  LyricsProvider,
  TrackSummary,
} from '../domain'

export const DEFAULT_LRCMUX_BASE_URL = 'https://api.lrcmux.dev/get'
export const LRCMUX_SOURCE = 'lrcmux'
const LRCMUX_ID_PREFIX = 'lrcmux:'

/** The metadata LrcMux needs to retrieve one lyric document. */
export interface LrcMuxTrackMetadata {
  artist: string
  title: string
  album?: string
  duration?: number
}

/** Options for the network-backed LrcMux fallback adapter. */
export interface LrcMuxLyricsProviderOptions {
  /** Injectable fetch implementation for tests or an application transport. */
  fetch?: typeof fetch
  /** Useful for tests; production callers should use the public LrcMux URL. */
  baseUrl?: string
}

/** A non-2xx response from LrcMux. */
export class LrcMuxRequestError extends Error {
  readonly status: number
  readonly retryAfter: string | null

  constructor(status: number, statusText = '', retryAfter: string | null = null) {
    const suffix = statusText.trim() ? ` ${statusText.trim()}` : ''
    const rateLimitHint = retryAfter ? ` Retry after ${retryAfter}.` : ''
    super(`LrcMux request failed (${status}${suffix}).${rateLimitHint}`)
    this.name = 'LrcMuxRequestError'
    this.status = status
    this.retryAfter = retryAfter
  }
}

/** A response or self-contained ID that does not match LrcMux's contract. */
export class LrcMuxPayloadError extends Error {
  constructor(message: string) {
    super(`Invalid LrcMux response: ${message}`)
    this.name = 'LrcMuxPayloadError'
  }
}

/** A valid LrcMux result with no readable lyric lines. */
export class LrcMuxLyricsUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LrcMuxLyricsUnavailableError'
  }
}

interface LrcMuxPayload {
  track: {
    instrumental: boolean
  }
  lines: Array<{ text: string }>
}

/**
 * Creates a stable, self-contained LrcMux summary.
 *
 * The ID stores only the metadata needed to repeat LrcMux's track lookup, so
 * `getLyrics` does not require a process-local search-result cache.
 */
export function createLrcMuxTrackSummary(metadata: LrcMuxTrackMetadata): TrackSummary {
  const normalized = normalizeMetadata(metadata)
  return {
    id: `${LRCMUX_ID_PREFIX}${encodeMetadata(normalized)}`,
    title: normalized.title,
    artist: normalized.artist,
    collection: normalized.album ?? 'Unknown album',
    source: LRCMUX_SOURCE,
  }
}

/** Decodes the lookup metadata stored in an LrcMux summary ID. */
export function decodeLrcMuxTrackMetadata(id: string): LrcMuxTrackMetadata {
  if (typeof id !== 'string' || !id.startsWith(LRCMUX_ID_PREFIX)) {
    throw new LrcMuxPayloadError(`track ID must start with "${LRCMUX_ID_PREFIX}".`)
  }

  const encoded = id.slice(LRCMUX_ID_PREFIX.length)
  if (!encoded) {
    throw new LrcMuxPayloadError('track ID is missing encoded metadata.')
  }

  let decoded: unknown
  try {
    decoded = JSON.parse(decodeBase64Url(encoded))
  } catch {
    throw new LrcMuxPayloadError('track ID contains invalid encoded metadata.')
  }

  if (!Array.isArray(decoded) || decoded.length !== 4) {
    throw new LrcMuxPayloadError('track ID metadata must be a four-item tuple.')
  }

  return normalizeMetadata({
    artist: decoded[0],
    title: decoded[1],
    album: decoded[2] === null ? undefined : decoded[2],
    duration: decoded[3] === null ? undefined : decoded[3],
  })
}

/** Reconstructs the original LrcMux summary from its self-contained ID. */
export function decodeLrcMuxTrackSummary(id: string): TrackSummary {
  return createLrcMuxTrackSummary(decodeLrcMuxTrackMetadata(id))
}

/**
 * A lyrics-only fallback for LrcMux's public get endpoint.
 *
 * LrcMux is deliberately not used for catalog search: a composite provider
 * should supply candidates from its primary catalog and call this adapter only
 * when it has a corresponding LrcMux summary ID.
 */
export class LrcMuxLyricsProvider implements LyricsProvider {
  readonly #fetch: typeof fetch
  readonly #baseUrl: string

  constructor({
    fetch: fetchImplementation,
    baseUrl = DEFAULT_LRCMUX_BASE_URL,
  }: LrcMuxLyricsProviderOptions = {}) {
    const resolvedFetch = fetchImplementation ?? globalThis.fetch
    if (!resolvedFetch) {
      throw new Error('LrcMux requires a fetch implementation.')
    }

    this.#fetch = fetchImplementation ?? resolvedFetch.bind(globalThis)
    this.#baseUrl = baseUrl
  }

  /**
   * LrcMux has no catalog-search responsibility in this application.
   * Returning no candidates keeps it safe to include in a composite provider.
   */
  async search(_query: string, signal?: AbortSignal): Promise<readonly TrackSummary[]> {
    throwIfAborted(signal)
    return []
  }

  async getLyrics(id: string, signal?: AbortSignal): Promise<LyricDocument> {
    throwIfAborted(signal)
    const metadata = decodeLrcMuxTrackMetadata(id)
    const payload = parsePayload(await this.#requestJson(this.#url(metadata), signal))

    if (payload.track.instrumental) {
      throw new LrcMuxLyricsUnavailableError(
        `"${metadata.title}" is instrumental and has no lyrics.`,
      )
    }

    const lines = normalizeLines(payload.lines)
    if (lines.length === 0) {
      throw new LrcMuxLyricsUnavailableError(
        `LrcMux returned no readable lyric lines for "${metadata.title}" (possibly instrumental).`,
      )
    }

    return {
      track: createLrcMuxTrackSummary(metadata),
      lines: lines.map((text, index) => ({ id: String(index + 1), text })),
    }
  }

  #url(metadata: LrcMuxTrackMetadata): URL {
    const url = new URL(this.#baseUrl)
    url.searchParams.set('artist', metadata.artist)
    url.searchParams.set('title', metadata.title)
    if (metadata.album) url.searchParams.set('album', metadata.album)
    if (metadata.duration !== undefined) url.searchParams.set('duration', String(metadata.duration))
    url.searchParams.set('format', 'json')
    url.searchParams.set('level', 'none')
    return url
  }

  async #requestJson(url: URL, signal?: AbortSignal): Promise<unknown> {
    throwIfAborted(signal)
    const response = await this.#fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    })
    throwIfAborted(signal)

    if (!response.ok) {
      throw new LrcMuxRequestError(
        response.status,
        response.statusText ?? '',
        response.status === 429 ? response.headers.get('Retry-After') : null,
      )
    }

    try {
      return await response.json()
    } catch (error) {
      if (isAbortError(error)) throw error
      throw new LrcMuxPayloadError('response body was not valid JSON.')
    }
  }
}

function parsePayload(value: unknown): LrcMuxPayload {
  if (!isRecord(value)) {
    throw new LrcMuxPayloadError('response must be an object.')
  }

  const track = parseRecord(value.track, 'track')
  const lines = value.lines
  if (!Array.isArray(lines)) {
    throw new LrcMuxPayloadError('lines must be an array.')
  }

  return {
    track: {
      instrumental: parseOptionalBoolean(track.instrumental, 'track.instrumental') ?? false,
    },
    lines: lines.map((line, index) => {
      const parsed = parseRecord(line, `lines[${index}]`)
      return { text: parseString(parsed.text, `lines[${index}].text`) }
    }),
  }
}

function normalizeMetadata(metadata: unknown): LrcMuxTrackMetadata {
  if (!isRecord(metadata)) {
    throw new LrcMuxPayloadError('track metadata must be an object.')
  }

  const artist = parseRequiredString(metadata.artist, 'track metadata.artist')
  const title = parseRequiredString(metadata.title, 'track metadata.title')
  const album = parseOptionalString(metadata.album, 'track metadata.album')
  const duration = parseOptionalDuration(metadata.duration, 'track metadata.duration')
  return { artist, title, album, duration }
}

function encodeMetadata(metadata: LrcMuxTrackMetadata): string {
  return encodeBase64Url(JSON.stringify([
    metadata.artist,
    metadata.title,
    metadata.album ?? null,
    metadata.duration ?? null,
  ]))
}

function normalizeLines(lines: readonly { text: string }[]): string[] {
  return lines
    .map(({ text }) => text.replace(/^\uFEFF/, '').trim())
    .filter(Boolean)
}

function parseRecord(value: unknown, location: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new LrcMuxPayloadError(`${location} must be an object.`)
  }
  return value
}

function parseRequiredString(value: unknown, location: string): string {
  const parsed = parseString(value, location)
  if (parsed === '') {
    throw new LrcMuxPayloadError(`${location} must be a non-empty string.`)
  }
  return parsed
}

function parseString(value: unknown, location: string): string {
  if (typeof value !== 'string') {
    throw new LrcMuxPayloadError(`${location} must be a string.`)
  }
  return value.trim()
}

function parseOptionalString(value: unknown, location: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    throw new LrcMuxPayloadError(`${location} must be a string when present.`)
  }
  return value.trim() || undefined
}

function parseOptionalDuration(value: unknown, location: string): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new LrcMuxPayloadError(`${location} must be a non-negative finite number when present.`)
  }
  return value
}

function parseOptionalBoolean(value: unknown, location: string): boolean | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'boolean') {
    throw new LrcMuxPayloadError(`${location} must be a boolean when present.`)
  }
  return value
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeBase64Url(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('not base64url')
  }

  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    '=',
  )
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const error = new Error('The LrcMux request was aborted.')
  error.name = 'AbortError'
  throw error
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === 'AbortError'
}
