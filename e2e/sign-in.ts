import type { Page } from '@playwright/test'

/**
 * Signs in with DEV_USERNAME / DEV_PASSWORD and lands on the front page. A fresh account (as
 * in CI) is sent through onboarding first, so skip it there.
 */
export async function signIn(page: Page) {
  await page.goto('/login', { waitUntil: 'networkidle' })
  await page.getByLabel('Username').fill(process.env.DEV_USERNAME ?? '')
  await page.getByLabel('Password').fill(process.env.DEV_PASSWORD ?? '')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const front = page.getByRole('heading', { name: 'Latest' })
  const skip = page.getByRole('button', { name: 'Skip for now' })
  await front.or(skip).waitFor()
  if (await skip.isVisible()) {
    await skip.click()
    await front.waitFor()
  }
}
