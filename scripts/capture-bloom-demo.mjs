import { chromium } from 'playwright'
import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

// Capture the real local reader artwork for the short shareable demo.
const previewUrl = process.argv[2] ?? 'http://127.0.0.1:5189/'
const outputDirectory = process.argv[3] ?? '/tmp/tiramisu-bloom-capture'

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1080, height: 1350 },
  deviceScaleFactor: 1,
  recordVideo: { dir: outputDirectory, size: { width: 1080, height: 1350 } },
})
const page = await context.newPage()

await page.goto(previewUrl, { waitUntil: 'networkidle' })
await page.locator('canvas').first().waitFor()
await page.waitForTimeout(900)

await page.mouse.move(890, 560)
for (let step = 0; step <= 45; step += 1) {
  const progress = step / 45
  const x = 890 - progress * 415
  const y = 560 - Math.sin(progress * Math.PI) * 120
  await page.mouse.move(x, y)
  await page.waitForTimeout(25)
}
await page.waitForTimeout(2100)

for (let step = 0; step <= 50; step += 1) {
  const progress = step / 50
  const x = 475 + progress * 410
  const y = 560 + Math.sin(progress * Math.PI * 1.5) * 120
  await page.mouse.move(x, y)
  await page.waitForTimeout(24)
}
await page.waitForTimeout(2200)
await page.mouse.wheel(0, 460)
await page.waitForTimeout(1000)

const video = page.video()
await context.close()
await browser.close()
if (!video) throw new Error('browser video was not created')
await mkdir(outputDirectory, { recursive: true })
const rawVideo = join(outputDirectory, 'tiramisu-bloom-raw.webm')
await copyFile(await video.path(), rawVideo)
process.stdout.write(`${rawVideo}\n`)
