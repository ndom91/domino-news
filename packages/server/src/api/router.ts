import {
  type ApiErrorBody,
  type ApiErrorCode,
  opsActionSchema,
  regionSchema,
  searchQuerySchema,
  summaryEditRequestSchema,
  userPreferencesSchema,
} from '@dn/schemas'
import { ZodError, z } from 'zod'
import type { ServerContext } from '../context.ts'
import { getFrontPage } from '../front.ts'
import { getOpsStatus, runOpsAction } from '../ops.ts'
import { getPreferences, savePreferences } from '../preferences.ts'
import { getPublisher, listPublishers } from '../publishers.ts'
import { analysisJob, QUEUES } from '../queues.ts'
import { getNarrative, getStory, listNarratives, listStories, resolveStoryId } from '../reader.ts'
import { searchAll } from '../search/search.ts'
import { DomainError, editSummary } from '../story-service.ts'

// Cursor format: "<ISO timestamp>|<story id>" (see listStories).
const storyListQuery = z.object({
  cursor: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T[^|]+\|.+$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  region: regionSchema.optional(),
})

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
  else if (error instanceof ZodError) {
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

async function readJson<T>(request: Request, parser: z.ZodType<T>): Promise<T> {
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
  handler: (args: {
    ctx: ServerContext
    request: Request
    url: URL
    params: Record<string, string | undefined>
    userId: string
  }) => Promise<Response>
}

const route = (method: Route['method'], pathname: string, handler: Route['handler']): Route => ({
  method,
  pattern: new URLPattern({ pathname }),
  handler,
})

const frontQuery = z.object({ region: regionSchema.optional() })

const routes: Route[] = [
  route('GET', '/api/v1/front', async ({ ctx, url, userId }) => {
    const { region } = frontQuery.parse(Object.fromEntries(url.searchParams))
    const { edition } = await getPreferences(ctx.db, userId)
    return json(await getFrontPage(ctx.db, { region, edition }))
  }),
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
    json(await savePreferences(ctx.db, userId, await readJson(request, userPreferencesSchema))),
  ),
  route('GET', '/api/v1/ops/status', async ({ ctx }) => json(await getOpsStatus(ctx))),
  route('POST', '/api/v1/ops/actions', async ({ ctx, request }) => {
    await runOpsAction(ctx, await readJson(request, opsActionSchema))
    return json({ ok: true })
  }),
]

/**
 * Versioned JSON API, independent of TanStack Start so it can be mounted anywhere and
 * exercised directly in contract tests. Every route requires a session (cookie or bearer).
 */
export async function handleApiRequest(ctx: ServerContext, request: Request): Promise<Response> {
  try {
    const url = new URL(request.url)
    const candidates = routes.filter((r) => r.pattern.test({ pathname: url.pathname }))
    if (candidates.length === 0) throw new HttpError('not_found', 'no such endpoint')
    const match = candidates.find((r) => r.method === request.method)
    if (!match) throw new HttpError('bad_request', `method ${request.method} not allowed`)

    const session = await ctx.auth.api.getSession({ headers: request.headers })
    if (!session) throw new HttpError('unauthorized', 'sign in required')

    const params = match.pattern.exec({ pathname: url.pathname })?.pathname.groups ?? {}
    return await match.handler({ ctx, request, url, params, userId: session.user.id })
  } catch (error) {
    return errorResponse(error)
  }
}
