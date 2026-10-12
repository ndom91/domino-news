import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { type Db, schema } from '@dn/db'
import { ID_PREFIX, newId } from '@dn/domain'
import { eq } from 'drizzle-orm'
import { z } from 'zod/mini'

const publisherSeed = z.array(
  z.object({
    slug: z.string(),
    name: z.string(),
    domain: z.string(),
    countryCode: z.optional(z.nullable(z.string())),
    languages: z.array(z.string()),
    articleBodyProcessingPolicy: z.enum(['metadata_only', 'transient_body_allowed']),
    kind: z._default(z.enum(['newsroom', 'official']), 'newsroom'),
    license: z.optional(z.nullable(z.string())),
    policyNote: z.string(),
    policyReviewedAt: z.string(),
    feeds: z.array(z.object({ url: z.url(), title: z.optional(z.string()) })),
  }),
)

/** Idempotently upsert the curated publisher + feed list. */
export async function seedPublishers(db: Db, fixtureDir: string) {
  const seeds = publisherSeed.parse(
    JSON.parse(await readFile(path.resolve(fixtureDir, 'publishers.json'), 'utf8')),
  )
  for (const p of seeds) {
    const values = {
      name: p.name,
      domain: p.domain,
      countryCode: p.countryCode ?? null,
      languages: p.languages,
      articleBodyPolicy: p.articleBodyProcessingPolicy,
      kind: p.kind,
      license: p.license ?? null,
      policyNote: p.policyNote,
      policyReviewedAt: new Date(p.policyReviewedAt),
    }
    const [pub] = await db
      .insert(schema.publisher)
      .values({ id: newId(ID_PREFIX.publisher), slug: p.slug, ...values })
      .onConflictDoUpdate({ target: schema.publisher.slug, set: values })
      .returning({ id: schema.publisher.id })
    if (!pub) continue
    for (const f of p.feeds) {
      await db
        .insert(schema.feed)
        .values({ id: newId(ID_PREFIX.feed), publisherId: pub.id, url: f.url, title: f.title })
        .onConflictDoUpdate({
          target: schema.feed.url,
          set: { title: f.title, publisherId: pub.id },
        })
    }
  }
  const count = await db.select({ id: schema.publisher.id }).from(schema.publisher)
  return { publishers: count.length }
}

export async function feedIds(db: Db) {
  const rows = await db
    .select({ id: schema.feed.id })
    .from(schema.feed)
    .where(eq(schema.feed.enabled, true))
  return rows.map((r) => r.id)
}
