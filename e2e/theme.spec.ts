import { expect, test, type Locator, type Page } from '@playwright/test'

type Theme = 'light' | 'dark'
type ThemePreference = Theme | 'system'
type ThemeOption = 'Light' | 'Dark' | 'System'

const THEME_OPTIONS: readonly ThemeOption[] = ['Light', 'Dark', 'System']
const THEME_PREFERENCE_STORAGE_KEY = 'tiramisu-theme-preference'

function themeRoot(page: Page): Locator {
  return page.locator('html')
}

/**
 * The control can use native radios or buttons, but each option must still
 * have an accessible name matching its visible label.
 */
function themeOption(page: Page, label: ThemeOption): Locator {
  return page
    .getByRole('radio', { name: label, exact: true })
    .or(page.getByRole('button', { name: label, exact: true }))
}

async function openThemeSurface(page: Page, colorScheme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme })
  await page.addInitScript((storageKey) => {
    // Keep each test independent of a preference left in the browser context.
    localStorage.removeItem(storageKey)
  }, THEME_PREFERENCE_STORAGE_KEY)
  await page.goto('/')
  await expect(page.getByRole('searchbox', { name: 'Search the lyric sheets' })).toBeVisible()
}

async function expectTheme(
  page: Page,
  theme: Theme,
  preference: ThemePreference,
): Promise<void> {
  await expect(themeRoot(page)).toHaveAttribute('data-theme', theme)
  await expect(themeRoot(page)).toHaveAttribute('data-theme-preference', preference)
}

test.describe('theme modes', () => {
  test('uses the restored light palette with silver teal ink while preserving dark', async ({ page }) => {
    await openThemeSurface(page, 'light')

    const palette = async () => page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement)
      return ['--paper', '--ink', '--red', '--yellow', '--blue', '--violet', '--teal']
        .map((token) => styles.getPropertyValue(token).trim())
    })

    await expect.poll(palette).toEqual([
      '#fff7df',
      '#173f42',
      '#ff4b35',
      '#ffe94c',
      '#7aa7aa',
      '#7a38d9',
      '#00b9a1',
    ])

    await themeOption(page, 'Dark').click()
    await expect.poll(palette).toEqual([
      '#160f18',
      '#f2e5d4',
      '#c06a59',
      '#d1a15d',
      '#899aab',
      '#b486a1',
      '#88a28e',
    ])
  })

  test('defaults to System and follows the operating-system color scheme', async ({ page }) => {
    await openThemeSurface(page, 'dark')
    await expectTheme(page, 'dark', 'system')

    await page.emulateMedia({ colorScheme: 'light' })
    await expect.poll(() => themeRoot(page).getAttribute('data-theme')).toBe('light')
    await expect(themeRoot(page)).toHaveAttribute('data-theme-preference', 'system')
  })

  test('exposes Light, Dark, and System as accessible options', async ({ page }) => {
    await openThemeSurface(page, 'light')

    for (const option of THEME_OPTIONS) {
      await expect(themeOption(page, option)).toBeVisible()
    }

    await themeOption(page, 'Light').click()
    await expectTheme(page, 'light', 'light')

    await themeOption(page, 'Dark').click()
    await expectTheme(page, 'dark', 'dark')

    await themeOption(page, 'System').click()
    await expectTheme(page, 'light', 'system')
  })

  test('persists an explicit preference across reloads', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    await expect(page.getByRole('searchbox', { name: 'Search the lyric sheets' })).toBeVisible()

    await themeOption(page, 'Dark').click()
    await expectTheme(page, 'dark', 'dark')

    await page.reload()
    await expect(page.getByRole('searchbox', { name: 'Search the lyric sheets' })).toBeVisible()
    await expectTheme(page, 'dark', 'dark')
  })
})
