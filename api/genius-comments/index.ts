import {
  normalizeCommentsResponse,
  selectMatchingSong,
  unavailableCommentsPayload,
} from '../../server/genius-comments/core.js'

const GENIUS_API = 'https://api.genius.com'
const GENIUS_WEB_API = 'https://genius.com/api/'
const MAX_QUERY_LENGTH = 160
const MAX_PAGE = 50
const COMMENTS_PER_PAGE = 20

/**
 * Thin Vercel route for the comments spike. The Genius access token is read
 * only here and is never included in a response to the browser.
 */
export async function GET(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET' })

  const query = readQuery(request)
  if ('error' in query) return json({ error: query.error }, 400)

  const token = process.env.GENIUS_ACCESS_TOKEN
  if (!token) return json({ error: 'Genius comments are not configured.' }, 503)

  let song
  try {
    const searchUrl = new URL('/search', GENIUS_API)
    searchUrl.searchParams.set('q', `${query.title} ${query.artist}`)
    const searchResponse = await fetch(searchUrl, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    })
    if (!searchResponse.ok) {
      console.warn('Genius search request failed.', { status: searchResponse.status })
      return json(
        { error: 'Genius search is unavailable.', upstreamStatus: searchResponse.status },
        502,
      )
    }

    song = selectMatchingSong(await searchResponse.json(), query.title, query.artist)
  } catch (error) {
    console.warn('Genius search request failed before a response.', {
      name: error instanceof Error ? error.name : 'UnknownError',
    })
    return json({ error: 'Genius search is unavailable.' }, 502)
  }

  if (!song) return json({ error: 'No matching Genius song was found.' }, 404)

  try {
    const commentsUrl = new URL(`songs/${song.id}/comments`, GENIUS_WEB_API)
    commentsUrl.searchParams.set('per_page', String(COMMENTS_PER_PAGE))
    commentsUrl.searchParams.set('page', String(query.page))
    commentsUrl.searchParams.set('text_format', 'plain')
    const commentsResponse = await fetch(commentsUrl, { headers: { Accept: 'application/json' } })
    if (!commentsResponse.ok) return json(unavailableCommentsPayload(song.songUrl), 200)

    return json(normalizeCommentsResponse(song.songUrl, await commentsResponse.json()), 200)
  } catch {
    // A matched song remains useful as an explicit Open on Genius fallback.
    return json(unavailableCommentsPayload(song.songUrl), 200)
  }
}

function readQuery(request: Request): { title: string; artist: string; page: number } | { error: string } {
  let url: URL
  try {
    url = new URL(request.url)
  } catch {
    return { error: 'Invalid request URL.' }
  }

  const title = url.searchParams.get('title')?.trim() ?? ''
  const artist = url.searchParams.get('artist')?.trim() ?? ''
  const pageValue = url.searchParams.get('page') ?? '1'

  if (!title || !artist || title.length > MAX_QUERY_LENGTH || artist.length > MAX_QUERY_LENGTH) {
    return { error: 'title and artist are required and must be at most 160 characters.' }
  }
  if (!/^[1-9]\d*$/.test(pageValue)) return { error: 'page must be a positive integer.' }

  const page = Number(pageValue)
  if (!Number.isSafeInteger(page) || page > MAX_PAGE) {
    return { error: `page must be between 1 and ${MAX_PAGE}.` }
  }

  return { title, artist, page }
}

function json(body: unknown, status: number, additionalHeaders: HeadersInit = {}): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...additionalHeaders },
  })
}
