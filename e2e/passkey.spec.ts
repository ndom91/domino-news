import { expect, test } from '@playwright/test'
import { signIn } from './sign-in.ts'

// Full WebAuthn round trip with Chromium's virtual authenticator.
test('register a passkey, sign out, and sign back in with it', async ({
  page,
  context,
  browserName,
}, testInfo) => {
  test.skip(
    browserName !== 'chromium' || testInfo.project.name !== 'desktop',
    'virtual authenticator: Chromium desktop only',
  )
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })

  // The login page offers passkeys in autofill on load, and this authenticator approves
  // every prompt by itself, so autofill would sign in before the button is clicked. Turn it
  // off to test the button deterministically.
  await page.addInitScript(() => {
    if (typeof PublicKeyCredential !== 'undefined') {
      PublicKeyCredential.isConditionalMediationAvailable = async () => false
    }
  })

  await signIn(page)

  await page.goto('/account?tab=security', { waitUntil: 'networkidle' })
  const name = `e2e-${Date.now()}`
  await page.getByLabel('Name (optional)').fill(name)
  await page.getByRole('button', { name: 'Add a passkey' }).click()
  const row = page.getByRole('listitem').filter({ hasText: name })
  await expect(row).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.waitForURL(/\/login/)
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click()
  await page.waitForURL('/')

  // Clean up so repeated runs don't accumulate credentials.
  await page.goto('/account?tab=security', { waitUntil: 'networkidle' })
  await row.getByRole('button', { name: 'Remove' }).click()
  await expect(row).toHaveCount(0)
})
