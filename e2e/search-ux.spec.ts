import { expect, test, type Page, type Route } from '@playwright/test'

const QA_SEARCH_RESULT = {
  id: 101,
  trackName: 'QA Signal',
  artistName: 'Test Artist',
  albumName: 'QA Collection',
  instrumental: false,
  plainLyrics: null,
  syncedLyrics: null,
}

const QA_LRCLIB_DOCUMENT = {
  ...QA_SEARCH_RESULT,
  plainLyrics: 'Original QA line alpha.\nOriginal QA line beta.\nOriginal QA line gamma.',
}

const QA_FEAR_SZA_RESULT = {
  id: 102,
  trackName: 'Far',
  artistName: 'SZA',
  albumName: 'QA Collection',
  instrumental: false,
  plainLyrics: 'QA reader content.',
  syncedLyrics: null,
}

const QA_LRCMUX_DOCUMENT = {
  track: { title: 'This Modern Love', artist: 'Bloc Party', instrumental: false },
  meta: {
    source: { id: 'qa-source', name: 'QA fixture', url: 'https://example.test/qa-source' },
    level: 'none',
  },
  lines: [
    { text: 'Original QA line one.' },
    { text: 'Original QA line two.' },
    { text: 'Original QA line three.' },
    { text: 'Original QA line four.' },
    { text: 'Original QA line five.' },
    { text: 'Original QA line six.' },
  ],
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function installApiFixtures(page: Page): Promise<void> {
  await page.route('**/api/genius-comments?**', async (route) => {
    await fulfillJson(route, {
      songUrl: 'https://genius.com/Bloc-party-this-modern-love-lyrics',
      comments: [
        {
          id: 'qa-comment-1',
          body: 'The chorus feels like a page turning.',
          author: 'QA listener',
          score: 7,
        },
      ],
    })
  })

  await page.route('https://lrclib.net/api/**', async (route) => {
    const url = new URL(route.request().url())

    if (url.pathname.endsWith('/search')) {
      const query = (url.searchParams.get('q') ?? url.searchParams.get('track_name'))
        ?.trim()
        .toLocaleLowerCase()
      if (query === 'modern') {
        await new Promise((resolve) => setTimeout(resolve, 180))
        await fulfillJson(route, [QA_SEARCH_RESULT])
        return
      }
      if (query === 'fear sza') {
        await fulfillJson(route, [
          { ...QA_SEARCH_RESULT, id: 103, trackName: 'Fear Not', artistName: 'Another Artist' },
          QA_FEAR_SZA_RESULT,
        ])
        return
      }
      if (query === 'broken') {
        await fulfillJson(route, { error: 'intentional QA failure' }, 503)
        return
      }
      await fulfillJson(route, [])
      return
    }

    if (url.pathname.endsWith('/get/101')) {
      await fulfillJson(route, QA_LRCLIB_DOCUMENT)
      return
    }

    if (url.pathname.endsWith('/get/102')) {
      await fulfillJson(route, QA_FEAR_SZA_RESULT)
      return
    }

    await route.continue()
  })

  await page.route('https://api.lyrics.ovh/suggest/**', async (route) => {
    await fulfillJson(route, { data: [] })
  })

  await page.route('https://api.lrcmux.dev/get', async (route) => {
    await fulfillJson(route, QA_LRCMUX_DOCUMENT)
  })
}

async function openSearch(page: Page): Promise<void> {
  await installApiFixtures(page)
  await page.goto('/')
  await expect(page.getByRole('searchbox', { name: 'Search the lyric sheets' })).toBeVisible()
}

test.describe('search UX', () => {
  test('discovers defaults, searches with loading, opens lyrics, and returns with back navigation', async ({ page }) => {
    await openSearch(page)

    await expect(page.getByRole('heading', { name: 'lyrics' })).toBeVisible()
    await expect(page.getByText('3 lyric sheets', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /This Modern Love/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Melancholy/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /cbd/ })).toBeVisible()

    const input = page.getByRole('searchbox', { name: 'Search the lyric sheets' })
    await input.fill('modern')
    await page.getByRole('button', { name: 'Look up' }).click()
    await expect(page.getByRole('button', { name: /Looking/ })).toBeDisabled()
    await expect(page.getByText('1 match', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /QA Signal/ })).toBeVisible()

    await page.getByRole('button', { name: /QA Signal/ }).click()
    await expect(page).toHaveURL(/\/lyrics\/lrclib:101$/)
    await expect(page.getByRole('heading', { name: 'QA Signal' })).toBeVisible()
    await expect(page.locator('.lyric-reader__line-ink-base', { hasText: 'Original QA line alpha.' })).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
    await expect(input).toHaveValue('modern')
    await expect(page.getByRole('button', { name: /QA Signal/ })).toBeVisible()
  })

  test('shows no results and recovers after a provider error', async ({ page }) => {
    await openSearch(page)
    const input = page.getByRole('searchbox', { name: 'Search the lyric sheets' })

    await input.fill('not-found')
    await page.getByRole('button', { name: 'Look up' }).click()
    await expect(page.getByText(/No lyric sheet matched “not-found”/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show all' })).toBeVisible()

    await input.fill('broken')
    await page.getByRole('button', { name: 'Look up' }).click()
    await expect(page.getByRole('alert')).toContainText('Couldn’t load lyrics.')
    await expect(input).toBeVisible()

    await input.fill('modern')
    await page.getByRole('button', { name: 'Look up' }).click()
    await expect(page.getByRole('button', { name: /QA Signal/ })).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('promotes an artist match for a title-and-artist query and opens its reader', async ({ page }) => {
    await openSearch(page)
    const input = page.getByRole('searchbox', { name: 'Search the lyric sheets' })

    await input.fill('fear sza')
    await page.getByRole('button', { name: 'Look up' }).click()

    const firstResult = page.locator('.result-list .result-card').first()
    await expect(page.getByRole('status')).toContainText('2 matches for “fear sza”')
    await expect(firstResult).toHaveAccessibleName(/Far SZA/)
    await firstResult.click()
    await expect(page).toHaveURL(/\/lyrics\/lrclib:102$/)
    await expect(page.getByRole('heading', { name: 'Far' })).toBeVisible()
  })

  test('changes LRCLIB retrieval and result ranking with the selected search field', async ({ page }) => {
    await openSearch(page)
    const input = page.getByRole('searchbox', { name: 'Search the lyric sheets' })

    await input.fill('fear sza')
    await page.getByText('Title', { exact: true }).click()
    await expect(page.getByRole('radio', { name: 'Title' })).toBeChecked()
    const titleRequest = page.waitForRequest((request) => request.url().includes('/api/search'))
    await page.getByRole('button', { name: 'Look up' }).click()
    expect(new URL((await titleRequest).url()).searchParams.get('track_name')).toBe('fear sza')
    await expect(page.locator('.result-list .result-card').first()).toHaveAccessibleName(/Fear Not Another Artist/)

    await page.getByText('Artist', { exact: true }).click()
    await expect(page.getByRole('radio', { name: 'Artist' })).toBeChecked()
    const artistRequest = page.waitForRequest((request) => request.url().includes('/api/search'))
    await page.getByRole('button', { name: 'Look up' }).click()
    expect(new URL((await artistRequest).url()).searchParams.get('q')).toBe('fear sza')
    await expect(page.locator('.result-list .result-card').first()).toHaveAccessibleName(/Far SZA/)
  })

  for (const viewport of [
    { label: 'desktop', width: 1280, height: 720 },
    { label: 'mobile', width: 390, height: 844 },
  ]) {
    test(`aligns identity and lyric copy on ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await openSearch(page)
      await page.getByRole('button', { name: /This Modern Love/ }).click()
      await expect(page.getByRole('heading', { name: 'This Modern Love' })).toBeVisible()

      const alignment = await page.evaluate(() => {
        const artist = document.querySelector('.lyric-reader__artist')
        const title = document.querySelector('.lyric-reader__title')
        const lyric = document.querySelector('.lyric-reader__line-text')
        if (!artist || !title || !lyric) return null

        return {
          artistLeft: artist.getBoundingClientRect().left,
          titleLeft: title.getBoundingClientRect().left,
          lyricLeft: lyric.getBoundingClientRect().left,
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }
      })

      expect(alignment).not.toBeNull()
      expect(Math.abs((alignment?.artistLeft ?? 0) - (alignment?.lyricLeft ?? 0))).toBeLessThanOrEqual(1)
      expect(Math.abs((alignment?.titleLeft ?? 0) - (alignment?.lyricLeft ?? 0))).toBeLessThanOrEqual(1)
      expect(alignment?.scrollWidth).toBeLessThanOrEqual(alignment?.clientWidth ?? 0)
    })
  }

  test('keeps the 390px mobile surface focused, scrollable, and within the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openSearch(page)

    const input = page.getByRole('searchbox', { name: 'Search the lyric sheets' })
    await input.focus()
    await expect(input).toBeFocused()

    const mobileMetrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(mobileMetrics.scrollWidth).toBeLessThanOrEqual(mobileMetrics.clientWidth)

    await page.getByRole('button', { name: /This Modern Love/ }).click()
    await expect(page.getByRole('heading', { name: 'This Modern Love' })).toBeVisible()
    const reader = page.locator('.lyric-reader')
    const readerBox = await reader.boundingBox()
    expect(readerBox?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(390)
    const readerMetrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(readerMetrics.scrollWidth).toBeLessThanOrEqual(readerMetrics.clientWidth)
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(844)

    for (const fraction of [0, 0.5, 1]) {
      await page.evaluate((scrollFraction) => {
        const scrollDistance = document.documentElement.scrollHeight - window.innerHeight
        window.scrollTo(0, scrollDistance * scrollFraction)
      }, fraction)

      await expect.poll(() => page.evaluate((scrollFraction) => {
        const identity = document.querySelector('.lyric-reader__identity')
        const lines = [...document.querySelectorAll('.lyric-reader__line')]
        if (!identity || lines.length === 0) return null

        const anchor = identity.getBoundingClientRect().bottom + 8
        const activeIndex = lines.findIndex((line) => line.getAttribute('aria-current') === 'true')
        const anchoredIndex = lines.findIndex((line) => line.getBoundingClientRect().top >= anchor)

        return {
          activeIndex,
          anchoredIndex: anchoredIndex === -1 ? lines.length - 1 : anchoredIndex,
          aligned: activeIndex === (anchoredIndex === -1 ? lines.length - 1 : anchoredIndex),
          atBoundary: scrollFraction === 0
            ? activeIndex === 0
            : scrollFraction === 1
              ? activeIndex === lines.length - 1
              : true,
          lineCount: lines.length,
          activeTop: lines[activeIndex]?.getBoundingClientRect().top ?? Number.NEGATIVE_INFINITY,
          anchor,
        }
      }, fraction)).toMatchObject({
        aligned: true,
        atBoundary: true,
      })

      const anchoredState = await page.evaluate(() => {
        const identity = document.querySelector('.lyric-reader__identity')
        const activeLine = document.querySelector('.lyric-reader__line[aria-current="true"]')
        return identity && activeLine
          ? {
              activeTop: activeLine.getBoundingClientRect().top,
              anchor: identity.getBoundingClientRect().bottom + 8,
            }
          : null
      })
      expect((anchoredState?.activeTop ?? 0) + 1).toBeGreaterThanOrEqual(anchoredState?.anchor ?? 0)
    }

    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

    await expect.poll(() => page.evaluate(() => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      return Math.abs(maxScroll - window.scrollY)
    })).toBeLessThanOrEqual(1)
    const lyricScrollPosition = await page.evaluate(() => window.scrollY)
    const commentsRequest = page.waitForRequest((request) =>
      request.url().includes('/api/genius-comments?'),
    )
    await page.getByRole('tab', { name: 'Comments' }).click()
    expect(new URL((await commentsRequest).url()).searchParams.get('title')).toBe('This Modern Love')
    await expect(page.getByText('The chorus feels like a page turning.')).toBeVisible()
    await expect(page.getByRole('link', { name: /Open this song on Genius/ })).toHaveAttribute(
      'href',
      'https://genius.com/Bloc-party-this-modern-love-lyrics',
    )

    await page.getByRole('tab', { name: 'Lyrics' }).click()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(lyricScrollPosition)

    const focusToggle = page.locator('.focus-mode-toggle')
    await focusToggle.click()
    await expect(focusToggle).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.reader-view')).toHaveAttribute('data-focus', 'true')
    await expect(page.getByRole('tab', { name: 'Comments' })).toHaveCount(0)
  })
})
