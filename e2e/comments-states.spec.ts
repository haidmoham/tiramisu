import { expect, test, type Page, type Route } from '@playwright/test'

const TRACK_DOCUMENT = {
  track: { title: 'This Modern Love', artist: 'Bloc Party', instrumental: false },
  meta: {
    source: { id: 'comments-visual', name: 'Comments visual fixture', url: 'https://example.test/comments' },
    level: 'none',
  },
  lines: [
    { text: 'The lyric sheet stays intact.' },
    { text: 'The reading position stays intact too.' },
  ],
}

const SONG_URL = 'https://genius.com/Bloc-party-this-modern-love-lyrics'

type CommentsState = 'loading' | 'populated' | 'empty' | 'unavailable'

const STATES: readonly CommentsState[] = ['loading', 'populated', 'empty', 'unavailable']
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
}

async function openCommentsState(page: Page, state: CommentsState): Promise<void> {
  await page.route('https://api.lrcmux.dev/get', async (route) => fulfillJson(route, TRACK_DOCUMENT))
  await page.route('**/api/genius-comments?**', async (route) => {
    if (state === 'loading') return new Promise(() => {})
    if (state === 'populated') {
      await fulfillJson(route, {
        songUrl: SONG_URL,
        comments: [
          {
            id: 'real-note-1',
            body: 'The chorus turns uncertainty into a direct invitation.',
            author: 'Genius contributor',
            score: 12,
          },
          {
            id: 'real-note-2',
            body: 'The title frames intimacy through the distance of modern life.',
            author: 'Margin reader',
            score: 4,
          },
        ],
      })
      return
    }
    if (state === 'empty') {
      await fulfillJson(route, { songUrl: SONG_URL, comments: [] })
      return
    }
    await fulfillJson(route, { songUrl: SONG_URL, comments: [], commentsUnavailable: true })
  })

  await page.goto('/')
  await page.getByRole('button', { name: /This Modern Love/ }).click()
  await expect(page.getByRole('heading', { name: 'This Modern Love' })).toBeVisible()
  await page.getByRole('tab', { name: 'Comments' }).click()

  const stateSurface = state === 'populated'
    ? page.locator('.reader-comments__collection')
    : page.locator(`.reader-comments__state--${state}`)
  await expect(stateSurface).toBeVisible()
}

for (const viewport of VIEWPORTS) {
  for (const state of STATES) {
    test(`${state} comments form a complete ${viewport.name} composition`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await openCommentsState(page, state)

      const metrics = await page.evaluate(() => {
        const header = document.querySelector('.reader-comments__header')?.getBoundingClientRect()
        const surface = document.querySelector('.reader-comments__state, .reader-comments__collection')?.getBoundingClientRect()
        return {
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          headerBottom: header?.bottom ?? 0,
          surfaceTop: surface?.top ?? Number.POSITIVE_INFINITY,
        }
      })

      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth)
      expect(metrics.surfaceTop - metrics.headerBottom).toBeLessThanOrEqual(48)
      await expect(page.locator(
        '.reader-comments__index, .reader-comments__footnote, .lyric-reader__line-number, .lyric-reader__rule',
      )).toHaveCount(0)

      await page.screenshot({
        path: testInfo.outputPath(`${state}-${viewport.name}.png`),
        fullPage: true,
      })
    })
  }
}
