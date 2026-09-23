import { expect, test } from '@playwright/test'

for (const width of [390, 1280]) {
  test(`song identity stays below controls at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 })
    await page.route('https://api.lrcmux.dev/get?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      track: { title: 'This Modern Love', artist: 'Bloc Party', instrumental: false },
      meta: { source: { id: 'layout', name: 'Layout fixture', url: 'https://example.test/layout' }, level: 'none' },
      lines: Array.from({ length: 16 }, (_, index) => ({ text: `Original reading sample ${index + 1}.` })),
    }) }))
    await page.goto('/')
    await page.getByRole('button', { name: /This Modern Love/ }).click()
    await expect(page.getByRole('heading', { name: 'Bloc Party' })).toBeVisible()
    await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }))
    await expect.poll(async () => {
      const title = await page.locator('.lyric-reader__identity').boundingBox()
      const tools = await page.locator('.reader-tools').boundingBox()
      return title && tools ? title.y - tools.y - tools.height : -999
    }).toBeGreaterThanOrEqual(-1)
    await expect(page.getByRole('heading', { name: 'This Modern Love' })).toBeInViewport()
    await expect(page.locator('.ambient-canvas canvas')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`reader-sticky-${width}.png`) })
    await page.getByRole('radio', { name: 'Somber' }).check()
    await page.screenshot({ path: testInfo.outputPath(`reader-somber-${width}.png`) })
  })
}

test('palette gallery remains readable and enlarges on phones', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/palette-lab.html')
  await expect(page.locator('.palette-card')).toHaveCount(8)
  const labels = await page.locator('.swatch-role, .swatch-value').evaluateAll(elements => elements.map(element => parseFloat(getComputedStyle(element).fontSize)))
  expect(Math.min(...labels)).toBeGreaterThanOrEqual(11)
  const before = await page.locator('.lyric').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize))
  await page.getByRole('button', { name: 'Focus', exact: true }).first().click()
  const after = await page.locator('.lyric').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize))
  expect(after).toBeGreaterThan(before)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: testInfo.outputPath('palette-phone.png') })
})
