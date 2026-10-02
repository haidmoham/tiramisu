import { expect, test, type Page, type Route } from '@playwright/test'

const TRACK_DOCUMENT = {
  id: 9878071,
  trackName: 'This Modern Love',
  artistName: 'Bloc Party',
  albumName: 'Silent Alarm',
  instrumental: false,
  plainLyrics: 'The lyric sheet stays intact.\nThe reading position stays intact too.',
  syncedLyrics: null,
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
  await page.route('https://lrclib.net/api/get/9878071', async (route) => fulfillJson(route, TRACK_DOCUMENT))
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
  await page.getByRole('tab', { name: 'Annotations' }).click()

  const stateSurface = state === 'populated'
    ? page.locator('.reader-comments__collection')
    : page.locator(`.reader-comments__state--${state}`)
  await expect(stateSurface).toBeVisible()
}

for (const viewport of VIEWPORTS) {
  for (const state of STATES) {
    test(`${state} annotations form a complete ${viewport.name} composition`, async ({ page }, testInfo) => {
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

for (const outcome of ['success', 'error'] as const) {
  test(`a late annotation ${outcome} keeps the selected lyrics view`, async ({ page }) => {
    await page.route('https://lrclib.net/api/get/9878071', route => fulfillJson(route, TRACK_DOCUMENT))
    let captureRoute: (route: Route) => void = () => {}
    const pendingRoute = new Promise<Route>(resolve => { captureRoute = resolve })
    let requests = 0
    await page.route('**/api/genius-comments?**', route => {
      requests += 1
      if (requests === 1) {
        captureRoute(route)
        return
      }
      return fulfillJson(route, { songUrl: SONG_URL, comments: [] })
    })

    await page.goto('/')
    await page.getByRole('button', { name: /This Modern Love/ }).click()
    const lyricsTab = page.getByRole('tab', { name: 'Lyrics', exact: true })
    const annotationsTab = page.getByRole('tab', { name: 'Annotations', exact: true })
    await annotationsTab.click()
    const heldRoute = await pendingRoute
    await expect(page.getByRole('status')).toContainText('Gathering the public annotations')
    await lyricsTab.click()
    await annotationsTab.click()
    await lyricsTab.click()
    await expect(lyricsTab).toHaveAttribute('aria-selected', 'true')

    await heldRoute.fulfill({
      status: outcome === 'success' ? 200 : 502,
      contentType: 'application/json',
      body: JSON.stringify({
        songUrl: SONG_URL,
        comments: [{ id: 'late-1', body: 'A delayed annotation.', author: 'Fixture contributor' }],
      }),
    })
    const completedState = outcome === 'success'
      ? '.reader-comments__collection'
      : '.reader-comments__state--error'
    await expect(page.locator(completedState)).toHaveCount(1)
    await expect(lyricsTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('The lyric sheet stays intact.', { exact: true })).toBeVisible()
    await expect(page.getByRole('tabpanel', { name: 'Annotations' })).toBeHidden()

    await annotationsTab.click()
    expect(requests).toBe(1)
    if (outcome === 'success') {
      await expect(page.getByText('A delayed annotation.', { exact: true })).toBeVisible()
    } else {
      await page.getByRole('button', { name: 'Try again', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'No public annotations came back for this song.' })).toBeVisible()
      expect(requests).toBe(2)
    }
  })
}
