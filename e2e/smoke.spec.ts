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

test('failed sign out leaves the reader signed in and allows retry', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/auth/sign-out', (route) =>
    route.fulfill({ status: 500, json: { message: 'Sign out failed' } }),
  )
  await page.getByRole('button', { name: /Account menu for/ }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page.getByText('Couldn’t sign out.')).toBeVisible()
  await page.getByRole('button', { name: /Account menu for/ }).click()
  await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeEnabled()
})

test('account following actions report failed changes', async ({ page }) => {
  await signIn(page)
  for (const [endpoint, item] of [
    ['follows', { targetType: 'publisher', id: 'p1', slug: 'example', title: 'Example publisher' }],
    ['muted-publishers', { id: 'p2', slug: 'muted', name: 'Muted publisher' }],
    ['signals', { kind: 'topic', key: 'climate', label: 'Climate', weight: 1 }],
  ] as const) {
    await page.route(`**/api/v1/me/${endpoint}`, (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ json: { items: [item] } })
        : route.fulfill({ status: 500, json: { error: 'Failed' } }),
    )
  }
  await page.getByRole('button', { name: /Account menu for/ }).click()
  await page.getByRole('menuitem', { name: 'Settings' }).click()
  await page.getByRole('tab', { name: 'Following' }).click()
  await page.getByRole('button', { name: 'Unfollow Example publisher' }).click()
  await expect(page.getByText('Couldn’t unfollow Example publisher.')).toBeVisible()
  await page.getByRole('button', { name: 'Unmute Muted publisher' }).click()
  await expect(page.getByText('Couldn’t unmute Muted publisher.')).toBeVisible()
  await page.getByRole('button', { name: 'Forget Climate' }).click()
  await expect(page.getByText('Couldn’t update your feedback.')).toBeVisible()
})

test('audio briefing shows preparation and the returned transcript', async ({ page }) => {
  await signIn(page)
  await page.goto('/briefing', { waitUntil: 'networkidle' })
  const panel = page.locator('section[aria-labelledby="audio-briefing-title"]')
  const prepare = panel.getByRole('button', { name: 'Prepare audio briefing' })
  await expect(prepare).toBeEnabled()
  let respond: (() => void) | undefined
  const wait = new Promise<void>((resolve) => {
    respond = resolve
  })
  const wav = Buffer.alloc(44 + 48000)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(wav.length - 8, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(24000, 24)
  wav.writeUInt32LE(48000, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(48000, 40)
  await page.route('**/api/v1/briefing/audio-prototype', async (route) => {
    await wait
    await route.fulfill({
      contentType: 'application/x-ndjson',
      body:
        [
          { type: 'selected', stories: [{ title: 'A test story', slug: 'test-story' }] },
          { type: 'stage', stage: 'writing' },
          { type: 'stage', stage: 'recording' },
          {
            type: 'result',
            audio: wav.toString('base64'),
            contentType: 'audio/wav',
            transcript: 'Hello from your briefing.',
            stories: [{ title: 'A test story', slug: 'test-story' }],
          },
        ]
          .map((event) => JSON.stringify(event))
          .join('\n') + '\n',
    })
  })
  await prepare.click()
  await expect(panel.getByText('Choosing stories…', { exact: false })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Cancel preparation' })).toBeVisible()
  respond?.()
  await expect(panel.getByRole('button', { name: /^Transcript/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  await expect(panel.getByText('Hello from your briefing.')).toBeHidden()
  await panel.getByRole('button', { name: /^Transcript/ }).click()
  await expect(panel.getByText('Hello from your briefing.')).toBeVisible()
  await expect(panel.getByRole('link', { name: 'A test story' })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Play briefing' })).toBeVisible()
  await expect(panel.getByRole('slider', { name: 'Seek audio briefing' })).toBeVisible()
  await expect(panel.getByRole('slider', { name: 'Seek audio briefing' })).toBeEnabled()
  await panel.getByRole('slider', { name: 'Seek audio briefing' }).focus()
  await page.keyboard.press('End')
  await expect(panel.getByRole('slider', { name: 'Seek audio briefing' })).toHaveValue('1')
  await page.keyboard.press('Home')
  await panel.getByRole('button', { name: 'Play briefing' }).click()
  await expect(panel.getByRole('button', { name: 'Pause briefing' })).toBeVisible()
  await panel.getByRole('button', { name: /Playback speed/ }).click()
  await expect(panel.getByRole('button', { name: /Playback speed 1.25/ })).toBeVisible()
  await panel.getByRole('button', { name: /^Transcript/ }).click()
  await expect(panel.getByText('Hello from your briefing.')).toBeHidden()
  await expect(panel.getByRole('button', { name: /Playback speed 1.25/ })).toBeVisible()
  await expectNoHorizontalOverflow(page)
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

test('story changes show a timeline with expandable updates and versions', async ({ page }) => {
  await page.route('**/api/v1/stories/*/updates', async (route) => {
    await route.fulfill({
      json: {
        items: Array.from({ length: 6 }, (_, index) => ({
          id: `update-${index}`,
          storyId: 'story-test',
          kind: index === 0 ? 'summary_revision' : 'new_reporting',
          description: `Timeline update ${index + 1}`,
          origin: 'system',
          createdAt: '2026-10-26T18:35:00.000Z',
          relatedStory: null,
          summaryDiff:
            index === 0 ? { previous: 'Earlier summary', current: 'Current summary' } : null,
          sources: [],
        })),
      },
    })
  })
  await signIn(page)
  await page.locator('main article h3 a').first().click()
  const changes = page.locator('section[aria-labelledby="updates-heading"]')
  await expect(changes.getByRole('heading', { name: 'What changed' })).toBeVisible()
  await expect(changes.locator('#story-updates-list > li')).toHaveCount(5)
  await expect(changes.getByText('18:35').first()).toBeVisible()
  await changes.getByText('Compare summary versions').click()
  await expect(changes.getByText('Earlier summary')).toBeVisible()
  await changes.getByRole('button', { name: 'View all 6 recent changes' }).click()
  await expect(changes.locator('#story-updates-list > li')).toHaveCount(6)
  await changes.getByRole('button', { name: 'Show fewer changes' }).click()
  await expect(changes.locator('#story-updates-list > li')).toHaveCount(5)
  await expectNoHorizontalOverflow(page)
})

test('original reporting groups reports and reveals cited reports', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/v1/stories/*', async (route) => {
    if (new URL(route.request().url()).pathname.split('/').length !== 5) return route.continue()
    const response = await route.fetch()
    const story = await response.json()
    const source = story.sources[0]
    if (!source) return route.fulfill({ response })
    story.sources = Array.from({ length: 6 }, (_, index) => ({
      ...source,
      articleId: `report-test-${index}`,
      title: `Test report ${index + 1}`,
      citedInSummary: index === 5,
      citation: index === 5 ? 1 : null,
      official: false,
    }))
    story.leanMix = [
      {
        country: 'US',
        publishers: [{ publisher: source.publisher, lean: 'centre_left', estimated: false }],
        oneSided: null,
      },
    ]
    await route.fulfill({ response, json: story })
  })
  await page.locator('main article h3 a').first().click()
  const reporting = page.locator('section[aria-labelledby="sources-heading"]')
  const group = reporting.locator('section[aria-labelledby="report-group-centre_left"]')
  await expect(group.getByText('Test report 1')).toBeVisible()
  await expect(group.getByText('Test report 3')).toHaveCount(0)
  await group.getByRole('button', { name: 'Show 4 more reports' }).click()
  await expect(group.getByText('Test report 6')).toBeVisible()
  await group.getByRole('button', { name: 'Show fewer reports' }).click()
  await page.evaluate(() => {
    window.location.hash = 'report-report-test-5'
  })
  await expect(reporting.getByText('Test report 6')).toBeVisible()
  await reporting.getByRole('button', { name: 'By time' }).click()
  await expect(reporting.getByRole('button', { name: 'By time' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(reporting.getByText('Test report 6')).toBeVisible()
  await expectNoHorizontalOverflow(page)
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
  // Political lean of the covering publishers (a bar, or a note that too few are rated).
  await expect(page.getByRole('heading', { name: 'Political lean' })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  // Blindspot: the one-sided section shows even with reading history off.
  await page.goto('/blindspot')
  await expect(page.getByRole('heading', { name: /Covered mostly by one side/ })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  // Local links to its explicit city/county/country setup in Account preferences.
  await page.goto('/local')
  await expect(page.getByRole('heading', { level: 1, name: 'Local' })).toBeVisible()
  await page.getByRole('link', { name: /setting your location here/ }).click()
  await expect(page).toHaveURL(/\/account\?tab=preferences#local-stories$/)
  await expect(page.getByRole('form', { name: 'Local news location' })).toBeVisible()
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
  await page.goto('/pipeline')
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
