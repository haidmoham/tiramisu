/** A compact record shown before a reader opens a lyric sheet. */
export interface TrackSummary {
  id: string
  title: string
  artist: string
  collection: string
  source: LyricsSource
}

/** The origin of lyric text. More provider kinds can be added without changing consumers. */
export type LyricsSource = 'fixture' | 'lrclib' | 'lrcmux'

/** The lookup lens applied to a free-text query. */
export type LyricsSearchField = 'smart' | 'title' | 'artist'

/** One displayed line in a lyric document. */
export interface LyricLine {
  id: string
  text: string
}

/** A complete lyric sheet for one track. */
export interface LyricDocument {
  track: TrackSummary
  lines: readonly LyricLine[]
}

/** The lookup boundary used by the application, independent of any lyric service. */
export interface LyricsProvider {
  search(
    query: string,
    signal?: AbortSignal,
    field?: LyricsSearchField,
  ): Promise<readonly TrackSummary[]>
  getLyrics(id: string, signal?: AbortSignal): Promise<LyricDocument>
}
