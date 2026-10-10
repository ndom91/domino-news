import { expect, type Page, test } from '@playwright/test'

async function signIn(page: Page) {
  await page.goto('/login', { waitUntil: 'networkidle' })
  await page.getByLabel('Username').fill(process.env.DEV_USERNAME ?? '')
  await page.getByLabel('Password').fill(process.env.DEV_PASSWORD ?? '')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('/')
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  )
  expect(overflow, 'page should not scroll horizontally').toBe(false)
}

test('unauthenticated visitors are sent to sign in', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})

test('feed → story → narrative → search', async ({ page }) => {
  await signIn(page)

  // Feed
  const firstStory = page.locator('main article h2 a').first()
  await expect(firstStory).toBeVisible()
  await expectNoHorizontalOverflow(page)

  // Story: summary, coverage and original reporting with outbound links
  await firstStory.click()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Original reporting' })).toBeVisible()
  await expect(
    page.locator('section[aria-labelledby="sources-heading"] a[target="_blank"]').first(),
  ).toBeVisible()
  await page.getByRole('button', { name: 'About this summary' }).click()
  await expect(page.getByText('How this summary is made')).toBeVisible()
  await page.keyboard.press('Escape')
  await expectNoHorizontalOverflow(page)

  // Narrative graph with clickable story nodes
  await page.goto('/narratives')
  const narrative = page.locator('main li a').first()
  if (await narrative.count()) {
    await narrative.click()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const nodes = page.locator('main ol[aria-label*="developments"] h3 a')
    await expect(nodes.first()).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await nodes.first().click()
    await expect(page).toHaveURL(/\/stories\//)
  }

  // Search (hybrid or keyword fallback)
  await page.goto('/search?q=nobel')
  await expect(page.getByText(/results ·/)).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('keyboard users can reach main navigation', async ({ page }) => {
  await signIn(page)
  await page.goto('/', { waitUntil: 'networkidle' })
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
})
