import { expect, type Page, test } from '@playwright/test'
import { signIn } from './sign-in.ts'

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  )
  expect(overflow, 'page should not scroll horizontally').toBe(false)
}

test('unauthenticated visitors are sent to sign in', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
})

test('about and legal pages are public and linked from login and the footer', async ({ page }) => {
  for (const [path, title] of [
    ['/about', 'About Domino'],
    ['/privacy', 'Privacy policy'],
    ['/terms', 'Terms of service'],
    ['/imprint', 'Imprint'],
  ] as const) {
    await page.goto(path)
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
    await expect(page.locator('h1')).toHaveCount(1)
    await expectNoHorizontalOverflow(page)
  }
  // Signed-out footer: legal links and a way to sign in.
  await page
    .getByRole('navigation', { name: 'Legal' })
    .getByRole('link', { name: 'Privacy' })
    .click()
  await expect(page).toHaveURL(/\/privacy$/)
  await page
    .getByRole('navigation', { name: 'Footer' })
    .getByRole('link', { name: 'Sign in' })
    .click()
  await expect(page).toHaveURL(/\/login/)
  await page
    .getByRole('navigation', { name: 'Legal' })
    .getByRole('link', { name: 'Imprint' })
    .click()
  await expect(page).toHaveURL(/\/imprint$/)
})

test('feed → story → narrative → search', async ({ page }) => {
  await signIn(page)

  // Signed in, the footer keeps the legal links.
  await expect(
    page.getByRole('navigation', { name: 'Legal' }).getByRole('link', { name: 'Terms' }),
  ).toBeVisible()

  // Feed
  const firstStory = page.locator('main article h3 a').first()
  await expect(firstStory).toBeVisible()
  await expectNoHorizontalOverflow(page)

  // Story: summary, coverage and original reporting with outbound links
  await firstStory.click()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Original reporting' })).toBeVisible()
  await expect(
    page.locator('section[aria-labelledby="sources-heading"] a[target="_blank"]').first(),
  ).toBeVisible()
  // The longer summary below the lead: at least two paragraphs.
  await expect(page.locator('[data-summary-detail] p').nth(1)).toBeVisible()
  // Context popovers: open the first one found among the first few stories.
  const term = page.locator('#lead-heading ~ p [role="button"][data-context-term]')
  for (let i = 0; i < 6 && (await term.count()) === 0; i++) {
    await page.goto('/')
    await page
      .locator('main article h3 a')
      .nth(i + 1)
      .click()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  }
  await expect(term.first()).toBeVisible()
  await term.first().click()
  await expect(page.getByText(/^Based on/).first()).toBeVisible()
  await page.keyboard.press('Escape')
  // Claims: grounded statements with the outlets that make them.
  await expect(page.getByRole('heading', { name: 'Claims' })).toBeVisible()
  await expect(page.getByText(/not verified facts/)).toBeVisible()
  await expect(page.getByText(/summary from \d+ of \d+ publishers?/)).toBeVisible()
  // Political lean of the covering publishers (a bar, or a note that too few are rated).
  await expect(page.getByRole('heading', { name: 'Political lean' })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  // Blindspot: the one-sided section shows even with reading history off.
  await page.goto('/blindspot')
  await expect(page.getByRole('heading', { name: /Covered mostly by one side/ })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  // Narrative graph with clickable story nodes
  await page.goto('/narratives')
  const narrative = page.locator('main li a').first()
  await expect(narrative).toBeVisible()
  await narrative.click()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const nodes = page.locator('main ol[aria-label*="oldest first"] h3 a')
  await expect(nodes.first()).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await nodes.first().click()
  await expect(page).toHaveURL(/\/stories\//)

  // Publisher coverage
  await page.goto('/publishers')
  await expectNoHorizontalOverflow(page)
  await page.locator('main a[href^="/publishers/"]').first().click()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  // Search (hybrid or keyword fallback)
  await page.goto('/search?q=nobel')
  await expect(page.getByText(/results ·/)).toBeVisible()
  await expect(page.locator('main a[href^="/stories/"]').first()).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('pipeline page lists failed jobs, or says there are none', async ({ page }) => {
  await signIn(page)
  await page.goto('/ops')
  await expect(page.getByRole('heading', { name: 'Failed jobs' })).toBeVisible()
  const failed = page.locator('#failed-jobs li > details')
  // The list loads after the page: wait for rows or the empty state before deciding.
  await expect(failed.first().or(page.getByText(/No failed jobs/))).toBeVisible()
  if ((await failed.count()) > 0) {
    await failed.first().locator(':scope > summary').click()
    await expect(failed.first().getByRole('button', { name: 'Retry job' })).toBeVisible()
  } else {
    await expect(page.getByText(/No failed jobs/)).toBeVisible()
  }
  await expectNoHorizontalOverflow(page)
})

test('keyboard users can reach main navigation', async ({ page }) => {
  await signIn(page)
  await page.goto('/', { waitUntil: 'networkidle' })
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
})
