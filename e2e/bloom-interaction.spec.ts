import { expect, test } from '@playwright/test'

test.use({ reducedMotion: 'no-preference', viewport: { width: 1280, height: 900 } })

test('petals gather visibly around the pointer and detach on release', async ({ page }, testInfo) => {
  test.setTimeout(60000)
  await page.addInitScript(() => {
    const probe = window as unknown as { petalPaint: { x: number; y: number }[] }
    probe.petalPaint = []
    const originalClear = CanvasRenderingContext2D.prototype.clearRect
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      probe.petalPaint = []
      return originalClear.apply(this, args)
    }
    const originalFill = CanvasRenderingContext2D.prototype.fill
    CanvasRenderingContext2D.prototype.fill = function (...args: Parameters<typeof originalFill>) {
      // Observe actual painted petals, whose maximum opacity is .84.
      if (this.globalAlpha > .7 && this.globalAlpha < .85) {
        const matrix = this.getTransform()
        const density = this.canvas.width / window.innerWidth
        probe.petalPaint.push({ x: matrix.e / density, y: matrix.f / density })
      }
      return originalFill.apply(this, args)
    }
  })
  await page.goto('/')
  await expect(page.locator('.ambient-canvas canvas')).toBeVisible()
  // Let ambient spawning reach its cap before testing eager pointer response.
  await page.waitForTimeout(28000)
  const art = await page.locator('.canopy-space--search').boundingBox()
  if (!art) throw new Error('The canopy needs a reserved layout area.')
  const center = { x: art.x + art.width * .62, y: art.y + art.height * .57 }
  for (let index = 0; index < 14; index += 1) {
    await page.mouse.move(center.x + Math.sin(index) * 8, center.y + Math.cos(index) * 8)
    await page.waitForTimeout(90)
  }
  await page.mouse.move(center.x, center.y)
  await expect.poll(async () => page.evaluate(({ x, y }) => {
    const points = (window as unknown as { petalPaint: { x: number; y: number }[] }).petalPaint
    return points.filter(point => {
      const radius = Math.hypot(point.x - x, point.y - y)
      return radius >= 32 && radius <= 85
    }).length
  }, center)).toBeGreaterThanOrEqual(20)
  await page.screenshot({ path: testInfo.outputPath('gathered-petal-ring.png') })
  await page.mouse.move(center.x - 150, center.y, { steps: 3 })
  await page.waitForTimeout(120)
  const lag = await page.evaluate(({ x, y }) => {
    const points = (window as unknown as { petalPaint: { x: number; y: number }[] }).petalPaint
    const centroid = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 })
    return Math.hypot(centroid.x - x, centroid.y - y)
  }, { x: center.x - 150, y: center.y })
  expect(lag).toBeGreaterThan(65)
  await page.screenshot({ path: testInfo.outputPath('moving-petal-cloud.png') })
  await page.mouse.move(center.x, center.y)
  await page.waitForTimeout(1600)
  const before = await page.evaluate(() => (window as unknown as { petalPaint: { x: number; y: number }[] }).petalPaint)
  await page.mouse.down()
  await page.mouse.up()
  await page.waitForTimeout(1600)
  const after = await page.evaluate(() => (window as unknown as { petalPaint: { x: number; y: number }[] }).petalPaint)
  expect(after.length).toBeGreaterThan(10)
  const averageY = (points: { y: number }[]) => points.reduce((total, point) => total + point.y, 0) / points.length
  expect(averageY(after)).toBeGreaterThan(averageY(before) + 4)
  await page.screenshot({ path: testInfo.outputPath('released-petals.png') })
})

test('touch gathering preserves native page scrolling', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const session = await page.context().newCDPSession(page)
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true })
  await page.goto('/')
  await expect(page.locator('.ambient-canvas canvas')).toBeVisible()
  const art = await page.locator('.canopy-space--search').boundingBox()
  if (!art) throw new Error('Missing phone art band.')
  const point = { x: 215, y: art.y + art.height * .55 }
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
  for (let index = 0; index < 12; index += 1) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + Math.sin(index) * 3, y: point.y + Math.cos(index) * 3 }] })
    await page.waitForTimeout(90)
  }
  await page.waitForTimeout(1100)
  await page.screenshot({ path: testInfo.outputPath('touch-gathering.png') })
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 110, y: 650 }] })
  for (let index = 1; index <= 8; index += 1) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 110, y: 650 - index * 45 }] })
    await page.waitForTimeout(25)
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100)
  await expect(page.getByRole('searchbox')).toBeVisible()
})
