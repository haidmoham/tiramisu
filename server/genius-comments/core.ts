export interface GeniusSongMatch {
  id: number
  songUrl: string
}

export interface GeniusComment {
  id: string
  body: string
  author: string
  avatarUrl?: string
  score?: number
}

export interface GeniusCommentsPayload {
  songUrl: string
  comments: GeniusComment[]
  nextPage?: number
  commentsUnavailable?: boolean
  commentsUpstreamStatus?: number
}

type RecordValue = Record<string, unknown>

/**
 * Accept only an exact, lightly normalized title and artist pair. Genius search
 * is intentionally not a ranking system here: an uncertain match is safer than
 * showing comments for a different song.
 */
export function selectMatchingSong(
  payload: unknown,
  requestedTitle: string,
  requestedArtist: string,
): GeniusSongMatch | undefined {
  const response = asRecord(payload)?.response
  const hits = asRecord(response)?.hits
  if (!Array.isArray(hits)) return undefined

  const title = normalizeMatchText(requestedTitle)
  const artist = normalizeMatchText(requestedArtist)
  if (!title || !artist) return undefined

  for (const hit of hits) {
    const result = asRecord(asRecord(hit)?.result)
    const primaryArtist = asRecord(result?.primary_artist)
    const id = result?.id
    const songUrl = result?.url

    if (
      typeof id === 'number' &&
      Number.isSafeInteger(id) &&
      id > 0 &&
      typeof songUrl === 'string' &&
      isGeniusSongUrl(songUrl) &&
      normalizeMatchText(result?.title) === title &&
      normalizeMatchText(primaryArtist?.name) === artist
    ) {
      return { id, songUrl }
    }
  }

  return undefined
}

/** Converts Genius's private response shape into the small browser contract. */
export function normalizeCommentsResponse(songUrl: string, payload: unknown): GeniusCommentsPayload {
  const response = asRecord(payload)?.response
  const commentsCandidate = asRecord(response)?.comments
  const comments: unknown[] = Array.isArray(commentsCandidate) ? commentsCandidate : []

  return {
    songUrl,
    comments: comments.flatMap((comment) => {
      const entry = asRecord(comment)
      const body = plainText(entry?.body)
      const author = asRecord(entry?.author)
      const authorName = plainText(author?.name)
      const id = entry?.id

      if (!body || !authorName || (typeof id !== 'string' && typeof id !== 'number')) return []

      const avatar = asRecord(author?.avatar)
      const avatarUrl = pickUrl(avatar?.tiny_url) ?? pickUrl(avatar?.url) ?? pickUrl(author?.avatar_url)
      const score = pickNumber(entry?.score) ?? pickNumber(entry?.votes_total)

      return [
        {
          id: String(id),
          body,
          author: authorName,
          ...(avatarUrl ? { avatarUrl } : {}),
          ...(score !== undefined ? { score } : {}),
        },
      ]
    }),
    ...nextPageFrom(response),
  }
}

export function unavailableCommentsPayload(
  songUrl: string,
  commentsUpstreamStatus?: number,
): GeniusCommentsPayload {
  return {
    songUrl,
    comments: [],
    commentsUnavailable: true,
    ...(commentsUpstreamStatus ? { commentsUpstreamStatus } : {}),
  }
}

function nextPageFrom(response: unknown): { nextPage?: number } {
  const record = asRecord(response)
  const pagination = asRecord(record?.pagination)
  const nextPage = pickPositiveInteger(record?.next_page) ?? pickPositiveInteger(pagination?.next_page)
  return nextPage === undefined ? {} : { nextPage }
}

function normalizeMatchText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\([^)]*(?:feat\.?|ft\.?).*?\)/gi, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function isGeniusSongUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'genius.com'
  } catch {
    return false
  }
}

function plainText(value: unknown): string | undefined {
  if (typeof value === 'string') return normalizedText(value)
  return normalizedText(asRecord(value)?.plain)
}

function normalizedText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text || undefined
}

function pickUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function pickNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function pickPositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

function asRecord(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined
}
