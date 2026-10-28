import { expect, test } from '@playwright/test'

test('toasts stack, expand on hover and can be dismissed', async ({ page }) => {
  await page.goto('/frame.html#?themeName=light&code=R_cE%28ToastDemo%2Cnull%29')
  await page.getByRole('button', { name: 'Show success' }).click()
  await page.getByRole('button', { name: 'Show error' }).click()

  const toasts = page.locator('.dn-toast')
  await expect(toasts).toHaveCount(2)
  await expect(toasts.first()).not.toHaveAttribute('data-expanded', '')
  await toasts.first().hover()
  await expect(toasts.first()).toHaveAttribute('data-expanded', '')
  await expect(toasts.last()).toHaveAttribute('data-expanded', '')
  await expect(toasts.last()).toContainText('Preferences saved')
  await toasts.last().getByRole('button', { name: 'Dismiss' }).click()
  await expect(toasts).toHaveCount(1)
})
