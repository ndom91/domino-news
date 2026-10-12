import { countryFromHeader, formatDate, plural } from '@dn/domain'
import {
  type ApiErrorBody,
  type ApiErrorCode,
  assessmentRequestSchema,
  feedbackRequestSchema,
  followRequestSchema,
  opsActionSchema,
  previewTypeSchema,
  readRequestSchema,
  regionSchema,
  searchQuerySchema,
  signalsRequestSchema,
  summaryEditRequestSchema,
  userPreferencesUpdateSchema,
} from '@dn/schemas'
import { z } from 'zod/mini'
import { createAssessment, listEvidence, publisherIdBySlug } from '../assessments.ts'
import type { ServerContext } from '../context.ts'
import { listSignals, setFeedback, updateSignals } from '../feedback.ts'
import { listFollows, setFollow } from '../follows.ts'
import { FOR_YOU_PAGE_SIZE, getForYou } from '../for-you.ts'
import { getEdition, getFrontPage } from '../front.ts'
import { getInsights } from '../insights.ts'
import { getOpsStatus, listFailedJobs, runOpsAction } from '../ops.ts'
import { getPreferences, recordRead, savePreferences } from '../preferences.ts'
import { getPreview, narrativePreview, storyPreview } from '../previews.ts'
import { getPublisher, listPublishers, publisherDomainBySlug } from '../publishers.ts'
import { analysisJob, QUEUES } from '../queues.ts'
import { getNarrative, getStory, listNarratives, listStories, resolveStoryId } from '../reader.ts'
import { searchAll } from '../search/search.ts'
import { DomainError, editSummary } from '../story-service.ts'

// Cursor format: "<ISO timestamp>|<story id>" (see listStories).
const storyListQuery = z.object({
  cursor: z.optional(z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}T[^|]+\|.+$/))),
  limit: z._default(z.coerce.number().check(z.int(), z.gte(1), z.lte(100)), 30),
  region: z.optional(regionSchema),
})

// Cursor = offset into the ranked window (see getForYou).
const forYouQuery = z.object({
  cursor: z.optional(z.string()),
  limit: z._default(
    z.coerce.number().check(z.int(), z.gte(1), z.lte(FOR_YOU_PAGE_SIZE)),
    FOR_YOU_PAGE_SIZE,
  ),
})

export type Session = Awaited<ReturnType<ServerContext['auth']['api']['getSession']>>

async function publisherIdOf(ctx: ServerContext, slug: string | undefined) {
  const id = await publisherIdBySlug(ctx.db, slug ?? '')
  if (!id) throw new HttpError('not_found', 'publisher not found')
  return id
}

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  unavailable: 503,
  internal: 500,
}

class HttpError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly issues?: ApiErrorBody['error']['issues'],
  ) {
    super(message)
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })

function errorResponse(error: unknown) {
  let err: HttpError
  if (error instanceof HttpError) err = error
  else if (error instanceof DomainError) err = new HttpError(error.code, error.message)
  else if (error instanceof z.core.$ZodError) {
    err = new HttpError(
      'bad_request',
      'invalid request',
      error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    )
  } else {
    console.error('[api] unhandled error', error)
    err = new HttpError('internal', 'internal error')
  }
  const body: ApiErrorBody = { error: { code: err.code, message: err.message, issues: err.issues } }
  return json(body, STATUS[err.code])
}

async function readJson<T>(request: Request, parser: z.ZodMiniType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw new HttpError('bad_request', 'body must be JSON')
  }
  return parser.parse(raw)
}

interface Route {
  method: 'GET' | 'POST'
  pattern: URLPattern
  adminOnly: boolean
  /** No session needed (and none read), so shared caches can store the response. */
  public: boolean
  handler: (args: {
    ctx: ServerContext
    request: Request
    url: URL
    params: Record<string, string | undefined>
    userId: string
  }) => Promise<Response>
}

const route = (
  method: Route['method'],
  pathname: string,
  handler: Route['handler'],
  { adminOnly = false, public: isPublic = false } = {},
): Route => ({
  method,
  pattern: new URLPattern({ pathname }),
  adminOnly,
  public: isPublic,
  handler,
})

// Logos rarely change, so browsers and Cloudflare may keep them for a year (see logos.ts).
const LOGO_CACHE = 'public, max-age=31536000, immutable'
// logo.dev has no logo for this publisher (or the slug is unknown): keep the 404 for a day.
const NO_LOGO_CACHE = 'public, max-age=86400'

const frontQuery = z.object({ region: z.optional(regionSchema) })

const routes: Route[] = [
  // Public: keyed by our publisher slug, never a domain, so it can't be used as a general
  // logo service. Unknown slugs never reach logo.dev.
  route(
    'GET',
    '/api/v1/logos/:slug.webp',
    async ({ ctx, params }) => {
      const domain = await publisherDomainBySlug(ctx.db, params.slug ?? '')
      const result = domain ? await ctx.logos.get(domain) : null
      if (result?.logo)
        return new Response(result.logo.bytes, {
          headers: { 'content-type': result.logo.contentType, 'cache-control': LOGO_CACHE },
        })
      // A passing failure (rate limit, outage, no key) must not be pinned at Cloudflare.
      const cache = !result || result.missing === 'none' ? NO_LOGO_CACHE : 'no-store'
      return new Response(null, { status: 404, headers: { 'cache-control': cache } })
    },
    { public: true },
  ),
  // Public: what a signed-out visitor or a link-preview crawler sees (see previews.ts).
  route(
    'GET',
    '/api/v1/previews/:type/:slug',
    async ({ ctx, params }) => {
      const type = previewTypeSchema.safeParse(params.type)
      const preview = type.success ? await getPreview(ctx.db, type.data, params.slug ?? '') : null
      if (!preview) throw new HttpError('not_found', 'nothing to preview')
      return json(preview)
    },
    { public: true },
  ),
  // Public share image (og:image). The URL carries ?v=<preview version>, so a new summary
  // gets a new URL and each version can be cached for good. Publishers use their logo instead;
  // /api/v1/og/site/default.png is the site-wide card.
  route(
    'GET',
    '/api/v1/og/:type/:slug.png',
    async ({ ctx, params }) => {
      const notFound = () =>
        new Response(null, { status: 404, headers: { 'cache-control': NO_LOGO_CACHE } })
      const slug = params.slug ?? ''
      // Loaded on demand: satori, resvg and the fonts stay out of every other request.
      const { renderShareCard, storyFootnote } = await import('../og/card.ts')
      if (params.type === 'story') {
        const story = await getStory(ctx.db, slug)
        if (!story) return notFound()
        const png = await renderShareCard({
          ...storyPreview(story),
          ...storyFootnote(
            story.sources.map((s) => s.publisher.name),
            story.publishedAt ?? story.lastUpdatedAt,
          ),
        })
        return new Response(new Uint8Array(png), {
          headers: { 'content-type': 'image/png', 'cache-control': LOGO_CACHE },
        })
      }
      if (params.type === 'narrative') {
        const narrative = await getNarrative(ctx.db, slug)
        if (!narrative) return notFound()
        const png = await renderShareCard({
          ...narrativePreview(narrative),
          footnote: plural(narrative.stories.length, 'story', 'stories'),
          date: formatDate(narrative.updatedAt),
        })
        return new Response(new Uint8Array(png), {
          headers: { 'content-type': 'image/png', 'cache-control': LOGO_CACHE },
        })
      }
      // The site-wide card: public pages and the fallback for everything else.
      if (params.type === 'site' && slug === 'default') {
        const png = await renderShareCard({
          title: 'Follow the news as it falls',
          kicker: 'Domino Wire',
          description: 'One story, every source, and what came next.',
          desk: null,
          footnote: 'Every publisher, one story',
          date: '',
        })
        return new Response(new Uint8Array(png), {
          headers: { 'content-type': 'image/png', 'cache-control': LOGO_CACHE },
        })
      }
      return notFound()
    },
    { public: true },
  ),
  route('GET', '/api/v1/front', async ({ ctx, url, userId }) => {
    const { region } = frontQuery.parse(Object.fromEntries(url.searchParams))
    const { regions } = await getPreferences(ctx.db, userId)
    return json(await getFrontPage(ctx.db, { region, regions }))
  }),
  route('GET', '/api/v1/edition', async ({ ctx }) => json(await getEdition(ctx.db))),
  route('GET', '/api/v1/stories', async ({ ctx, url }) =>
    json(await listStories(ctx.db, storyListQuery.parse(Object.fromEntries(url.searchParams)))),
  ),
  route('GET', '/api/v1/stories/:id', async ({ ctx, params }) => {
    const story = await getStory(ctx.db, params.id ?? '')
    if (!story) throw new HttpError('not_found', 'story not found')
    return json(story)
  }),
  route('POST', '/api/v1/stories/:id/summary', async ({ ctx, request, params, userId }) => {
    if (!ctx.config.enableSummaryEditing)
      throw new HttpError('forbidden', 'summary editing is disabled')
    const body = await readJson(request, summaryEditRequestSchema)
    const storyId = await resolveStoryId(ctx.db, params.id ?? '')
    if (!storyId) throw new HttpError('not_found', 'story not found')
    const versionId = await ctx.db.transaction((tx) =>
      editSummary(tx, { storyId, userId, ...body }),
    )
    // Context anchors refer to the old wording; regenerate them for the edited text.
    const job = analysisJob(storyId, versionId, 'interactive')
    await (await ctx.boss()).send(QUEUES.generateContext, job.data, job.options)
    const story = await getStory(ctx.db, storyId)
    return json(story)
  }),
  route('GET', '/api/v1/narratives', async ({ ctx }) => json(await listNarratives(ctx.db))),
  route('GET', '/api/v1/narratives/:id', async ({ ctx, params }) => {
    const narrative = await getNarrative(ctx.db, params.id ?? '')
    if (!narrative) throw new HttpError('not_found', 'narrative not found')
    return json(narrative)
  }),
  route('GET', '/api/v1/publishers', async ({ ctx }) => json(await listPublishers(ctx.db))),
  route('GET', '/api/v1/publishers/:slug', async ({ ctx, params }) => {
    const publisher = await getPublisher(ctx.db, params.slug ?? '')
    if (!publisher) throw new HttpError('not_found', 'publisher not found')
    return json(publisher)
  }),
  route('GET', '/api/v1/search', async ({ ctx, url }) => {
    const query = searchQuerySchema.parse(Object.fromEntries(url.searchParams))
    try {
      return json(await searchAll(ctx.db, ctx.ts, ctx.inference.embeddings, query))
    } catch (error) {
      console.error('[api] search failed', error)
      throw new HttpError('unavailable', 'search is temporarily unavailable')
    }
  }),
  route('GET', '/api/v1/me/preferences', async ({ ctx, userId }) =>
    json(await getPreferences(ctx.db, userId)),
  ),
  route('POST', '/api/v1/me/preferences', async ({ ctx, request, userId }) =>
    json(
      await savePreferences(ctx.db, userId, await readJson(request, userPreferencesUpdateSchema)),
    ),
  ),
  route('GET', '/api/v1/me/follows', async ({ ctx, userId }) =>
    json(await listFollows(ctx.db, userId)),
  ),
  route('POST', '/api/v1/me/follows', async ({ ctx, request, userId }) =>
    json(await setFollow(ctx.db, userId, await readJson(request, followRequestSchema))),
  ),
  route('POST', '/api/v1/me/feedback', async ({ ctx, request, userId }) =>
    json(await setFeedback(ctx.db, userId, await readJson(request, feedbackRequestSchema))),
  ),
  route('GET', '/api/v1/me/signals', async ({ ctx, userId }) =>
    json(await listSignals(ctx.db, userId)),
  ),
  route('POST', '/api/v1/me/signals', async ({ ctx, request, userId }) =>
    json(await updateSignals(ctx.db, userId, await readJson(request, signalsRequestSchema))),
  ),
  route('GET', '/api/v1/for-you', async ({ ctx, url, userId }) =>
    json(await getForYou(ctx.db, userId, forYouQuery.parse(Object.fromEntries(url.searchParams)))),
  ),
  route('POST', '/api/v1/me/reads', async ({ ctx, request, userId }) => {
    const { storyId } = await readJson(request, readRequestSchema)
    return json({ recorded: await recordRead(ctx.db, userId, storyId) })
  }),
  route('GET', '/api/v1/me/insights', async ({ ctx, request, userId }) =>
    json(await getInsights(ctx.db, userId, countryFromHeader(request.headers.get('cf-ipcountry')))),
  ),
  route(
    'GET',
    '/api/v1/publishers/:slug/evidence',
    async ({ ctx, params }) =>
      json(await listEvidence(ctx.db, await publisherIdOf(ctx, params.slug))),
    { adminOnly: true },
  ),
  route(
    'POST',
    '/api/v1/publishers/:slug/assessment',
    async ({ ctx, request, params, userId }) => {
      const body = await readJson(request, assessmentRequestSchema)
      const publisherId = await publisherIdOf(ctx, params.slug)
      return json(
        await createAssessment(ctx.db, { publisherId, reviewedBy: userId, request: body }),
      )
    },
    { adminOnly: true },
  ),
  route('GET', '/api/v1/ops/status', async ({ ctx }) => json(await getOpsStatus(ctx)), {
    adminOnly: true,
  }),
  route(
    'GET',
    '/api/v1/ops/failed',
    async ({ ctx, url }) =>
      json(
        await listFailedJobs(ctx, {
          queue: url.searchParams.get('queue') || undefined,
          cursor: url.searchParams.get('cursor') || undefined,
        }),
      ),
    { adminOnly: true },
  ),
  route(
    'POST',
    '/api/v1/ops/actions',
    async ({ ctx, request }) => {
      const result = await runOpsAction(ctx, await readJson(request, opsActionSchema))
      return json({ ok: true, ...result })
    },
    { adminOnly: true },
  ),
]

/**
 * Versioned JSON API, independent of TanStack Start so it can be mounted anywhere and
 * exercised directly in contract tests. Every route requires a session (cookie or bearer),
 * except the few marked public.
 */
export async function handleApiRequest(
  ctx: ServerContext,
  request: Request,
  // SSR passes the page request's session, so in-process calls don't each look it up again.
  session?: Promise<Session | null>,
): Promise<Response> {
  try {
    const url = new URL(request.url)
    const candidates = routes.filter((r) => r.pattern.test({ pathname: url.pathname }))
    if (candidates.length === 0) throw new HttpError('not_found', 'no such endpoint')
    const match = candidates.find((r) => r.method === request.method)
    if (!match) throw new HttpError('bad_request', `method ${request.method} not allowed`)

    const params = match.pattern.exec({ pathname: url.pathname })?.pathname.groups ?? {}
    if (match.public) return await match.handler({ ctx, request, url, params, userId: '' })

    const user = (await (session ?? ctx.auth.api.getSession({ headers: request.headers })))?.user
    if (!user) throw new HttpError('unauthorized', 'sign in required')
    if (match.adminOnly && user.role !== 'admin') throw new HttpError('forbidden', 'admin only')

    return await match.handler({ ctx, request, url, params, userId: user.id })
  } catch (error) {
    return errorResponse(error)
  }
}
