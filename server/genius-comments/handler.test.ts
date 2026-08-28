import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from '../../api/genius-comments/index'

afterEach(() => {
  vi.unstubAllEnvs()
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
})
