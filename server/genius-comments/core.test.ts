import { describe, expect, it } from 'vitest'
import { normalizeCommentsResponse, selectMatchingSong } from './core.js'

describe('normalizeCommentsResponse', () => {
  it('keeps only the minimal plain-text comment contract', () => {
    expect(
      normalizeCommentsResponse('https://genius.com/Brakence-cbd-lyrics', {
        response: {
          comments: [
            {
              id: 42,
              body: { plain: '  the production is unreal  ', html: '<em>ignored</em>' },
              author: {
                name: 'listener',
                avatar: { tiny_url: 'https://images.genius.com/avatar.png' },
              },
              votes_total: 9,
            },
            { id: 43, body: { html: '<b>not plain</b>' }, author: { name: 'skip me' } },
          ],
          pagination: { next_page: 2 },
        },
      }),
    ).toEqual({
      songUrl: 'https://genius.com/Brakence-cbd-lyrics',
      comments: [
        {
          id: '42',
          body: 'the production is unreal',
          author: 'listener',
          avatarUrl: 'https://images.genius.com/avatar.png',
          score: 9,
        },
      ],
      nextPage: 2,
    })
  })

  it('turns official Genius song referents into genuine public notes', () => {
    expect(
      normalizeCommentsResponse('https://genius.com/Queen-bohemian-rhapsody-lyrics', {
        response: {
          referents: [
            {
              annotations: [
                {
                  id: 901,
                  body: { plain: 'A real annotation from the matched Genius song.' },
                  votes_total: 14,
                  authors: [
                    {
                      attribution: 1,
                      user: {
                        name: 'Genius contributor',
                        avatar: { tiny: { url: 'https://images.genius.com/contributor.png' } },
                      },
                    },
                  ],
                },
              ],
            },
          ],
          next_page: 2,
        },
      }),
    ).toEqual({
      songUrl: 'https://genius.com/Queen-bohemian-rhapsody-lyrics',
      comments: [
        {
          id: '901',
          body: 'A real annotation from the matched Genius song.',
          author: 'Genius contributor',
          avatarUrl: 'https://images.genius.com/contributor.png',
          score: 14,
        },
      ],
      nextPage: 2,
    })
  })
})

describe('selectMatchingSong', () => {
  it('rejects an obvious title or artist mismatch instead of using the first search hit', () => {
    expect(
      selectMatchingSong(
        {
          response: {
            hits: [
              {
                result: {
                  id: 1,
                  title: 'cbd',
                  primary_artist: { name: 'Somebody Else' },
                  url: 'https://genius.com/Somebody-else-cbd-lyrics',
                },
              },
            ],
          },
        },
        'cbd',
        'brakence',
      ),
    ).toBeUndefined()
  })
})
