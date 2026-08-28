import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from '../../api/genius-comments/index'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('GET /api/genius-comments', () => {
  it('returns a response immediately when the server token is missing', async () => {
    vi.stubEnv('GENIUS_ACCESS_TOKEN', '')

    const response = await GET(
      new Request('https://tiramisu.test/api/genius-comments?title=cbd&artist=brakence&page=1'),
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'Genius comments are not configured.',
    })
  })

  it('reports only the upstream status when Genius search rejects the request', async () => {
    vi.stubEnv('GENIUS_ACCESS_TOKEN', 'configured-for-test')
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 403 })))

    const response = await GET(
      new Request('https://tiramisu.test/api/genius-comments?title=cbd&artist=brakence&page=1'),
    )

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      error: 'Genius search is unavailable.',
      upstreamStatus: 403,
    })
  })

  it('keeps the song fallback and reports when the comments feed is blocked', async () => {
    vi.stubEnv('GENIUS_ACCESS_TOKEN', 'configured-for-test')
    vi.stubGlobal('fetch', vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        response: {
          hits: [{
            result: {
              id: 123,
              title: 'cbd',
              primary_artist: { name: 'brakence' },
              url: 'https://genius.com/Brakence-cbd-lyrics',
            },
          }],
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 403 })))

    const response = await GET(
      new Request('https://tiramisu.test/api/genius-comments?title=cbd&artist=brakence&page=1'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      songUrl: 'https://genius.com/Brakence-cbd-lyrics',
      comments: [],
      commentsUnavailable: true,
      commentsUpstreamStatus: 403,
    })
  })

  it('loads real song notes through the authenticated official referents endpoint', async () => {
    vi.stubEnv('GENIUS_ACCESS_TOKEN', 'configured-for-test')
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        response: {
          hits: [{
            result: {
              id: 456,
              title: 'Bohemian Rhapsody',
              primary_artist: { name: 'Queen' },
              url: 'https://genius.com/Queen-bohemian-rhapsody-lyrics',
            },
          }],
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        response: {
          referents: [{
            annotations: [{
              id: 901,
              body: { plain: 'A real song note.' },
              votes_total: 14,
              authors: [{ user: { name: 'Genius contributor' } }],
            }],
          }],
        },
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await GET(
      new Request('https://tiramisu.test/api/genius-comments?title=Bohemian%20Rhapsody&artist=Queen&page=1'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      songUrl: 'https://genius.com/Queen-bohemian-rhapsody-lyrics',
      comments: [{ id: '901', body: 'A real song note.', author: 'Genius contributor', score: 14 }],
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const [referentsUrl, referentsRequest] = fetchMock.mock.calls[1] ?? []
    expect(String(referentsUrl)).toContain('https://api.genius.com/referents?')
    expect(new URL(String(referentsUrl)).searchParams.get('song_id')).toBe('456')
    expect(new Headers(referentsRequest?.headers).get('Authorization')).toBe('Bearer configured-for-test')
  })
})
