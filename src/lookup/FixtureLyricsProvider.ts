import type {
  LyricDocument,
  LyricsProvider,
  TrackSummary,
} from '../domain'

/** Enter this query (or ID) to exercise an error state without a network dependency. */
export const FIXTURE_FAILURE_TRIGGER = 'fixture:fail'

const TRACKS: readonly LyricDocument[] = [
  {
    track: {
      id: 'this-modern-love',
      title: 'This Modern Love',
      artist: 'Bloc Party',
      collection: 'Preview shelf',
      source: 'fixture',
    },
    lines: [
      { id: '1', text: '[Licensed lyrics are not loaded in this preview.]' },
      { id: '2', text: '[Connect a licensed source to read this track.]' },
    ],
  },
  {
    track: {
      id: 'melancholy',
      title: 'Melancholy',
      artist: 'Driveways',
      collection: 'Preview shelf',
      source: 'fixture',
    },
    lines: [
      { id: '1', text: '[Licensed lyrics are not loaded in this preview.]' },
      { id: '2', text: '[Connect a licensed source to read this track.]' },
    ],
  },
  {
    track: {
      id: 'cbd',
      title: 'cbd',
      artist: 'brakence',
      collection: 'Preview shelf',
      source: 'fixture',
    },
    lines: [
      { id: '1', text: '[Licensed lyrics are not loaded in this preview.]' },
      { id: '2', text: '[Connect a licensed source to read this track.]' },
    ],
  },
]

export interface FixtureLyricsProviderOptions {
  /** Artificial wait used to make loading states visible. Defaults to 220 ms. */
  latencyMs?: number
}

/**
 * A deterministic, abortable provider for local UI work.
 * It deliberately contains metadata and non-lyrical placeholders only.
 */
export class FixtureLyricsProvider implements LyricsProvider {
  readonly #latencyMs: number

  constructor({ latencyMs = 220 }: FixtureLyricsProviderOptions = {}) {
    this.#latencyMs = latencyMs
  }

  async search(query: string, signal?: AbortSignal): Promise<readonly TrackSummary[]> {
    await wait(this.#latencyMs, signal)
    this.#throwIfFailureTrigger(query)

    const needle = normalize(query)
    if (!needle) {
      return TRACKS.map(({ track }) => track)
    }

    return TRACKS.filter(({ track }) => {
      const searchable = normalize(`${track.title} ${track.artist} ${track.collection}`)
      return searchable.includes(needle)
    }).map(({ track }) => track)
  }

  async getLyrics(id: string, signal?: AbortSignal): Promise<LyricDocument> {
    await wait(this.#latencyMs, signal)
    this.#throwIfFailureTrigger(id)

    const document = TRACKS.find(({ track }) => track.id === id)
    if (!document) {
      throw new Error(`No fixture lyrics found for track "${id}".`)
    }

    return document
  }

  #throwIfFailureTrigger(value: string): void {
    if (normalize(value) === FIXTURE_FAILURE_TRIGGER) {
      throw new Error('Fixture lyrics provider intentionally failed for UI testing.')
    }
  }
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function abortError(): Error {
  const error = new Error('The lyrics request was aborted.')
  error.name = 'AbortError'
  return error
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(abortError())
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(done, milliseconds)

    function done(): void {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }

    function onAbort(): void {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', onAbort)
      reject(abortError())
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
