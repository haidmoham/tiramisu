import { expect, test } from '@playwright/test'
import { createLrcMuxTrackSummary } from '../src/lookup/LrcMuxLyricsProvider'

const metadata = {
  title: 'High Tops', artist: 'Del Water Gap',
  album: '1 (646) 943 2672 (Extended Play)', duration: 238,
}
const sourceDocument = {
  id: 14549273, trackName: metadata.title, artistName: metadata.artist,
  albumName: metadata.album, duration: metadata.duration, instrumental: false,
  plainLyrics: 'Original provider recovery test line.', syncedLyrics: null,
}
const fallbackDocument = {
  track: { ...metadata, instrumental: false },
  meta: { source: { name: 'Recovery fixture', url: 'https://example.test/source' } },
  lines: [{ text: 'Original provider recovery test line.' }],
}

for (const failure of ['stalled search', 'unavailable detail'] as const) {
  test(`recovers High Tops from ${failure}`, async ({ page }) => {
    await page.route('https://api.lyrics.ovh/suggest/**', route => route.fulfill({ json: { data: [{
      title: metadata.title, artist: { name: metadata.artist },
      album: { title: metadata.album }, duration: metadata.duration,
    }] } }))
    await page.route('https://lrclib.net/api/search?**', route => {
      if (failure === 'stalled search') return
      return route.fulfill({ json: [sourceDocument] })
    })
    await page.route('https://lrclib.net/api/get/**', route => route.fulfill({ status: 503, json: {} }))
    await page.route('https://api.lrcmux.dev/get?**', route => route.fulfill({ json: fallbackDocument }))
    await page.goto('/?q=High+Tops+Del+Water+Gap')
    const result = page.getByRole('button', { name: /High Tops/ })
    await expect(result).toBeVisible({ timeout: 12_000 })
    await result.click()
    await expect(page.getByRole('heading', { name: 'High Tops', exact: true })).toBeVisible()
    await expect(page.getByText('Original provider recovery test line.', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: /Recovery fixture/ })).toBeVisible()
    // Back must retain the result and allow another read after recovery.
    await page.goBack()
    await expect(result).toBeVisible()
    await result.click()
    await expect(page.getByRole('heading', { name: 'High Tops', exact: true })).toBeVisible()
  })
}

test('recovers a saved LrcMux link through an exact LRCLIB recording', async ({ page }) => {
  await page.route('https://api.lrcmux.dev/get?**', route => route.fulfill({ status: 503, json: {} }))
  await page.route('https://lrclib.net/api/search?**', route => route.fulfill({ json: [
    { ...sourceDocument, id: 25414324, duration: 250.8 }, sourceDocument,
  ] }))
  await page.route('https://lrclib.net/api/get/14549273', route => route.fulfill({ json: sourceDocument }))
  await page.goto(`/lyrics/${createLrcMuxTrackSummary(metadata).id}`)
  await expect(page.getByRole('heading', { name: 'High Tops', exact: true })).toBeVisible()
  await expect(page.getByText('Original provider recovery test line.', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /LRCLIB/ })).toBeVisible()
})
