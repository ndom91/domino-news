import { writeFile } from 'node:fs/promises'
import type { Db } from '@dn/db'
import { sql } from 'drizzle-orm'

// Match quality evaluation. A set is a sample of real articles (public feed metadata only);
// its labels group them into stories by docs/story-granularity.md. See docs/006.

export interface EvalArticle {
  id: string
  publisher: string
  publisherKind: 'newsroom' | 'official'
  title: string
  description: string | null
  publishedAt: string
}

export interface EvalSet {
  name: string
  createdAt: string
  // How the set was drawn, so it can be redrawn or extended.
  sample: { days: number; seeds: string[]; neighbourMin: number; randomCount: number }
  articles: EvalArticle[]
}

type Row = {
  id: string
  publisher: string
  kind: 'newsroom' | 'official'
  title: string
  description: string | null
  at: Date
}

/**
 * Draw an evaluation set: for each seed (a title pattern), every article within `days` whose
 * embedding is close to the centre of the seed's articles, so the set holds busy events and
 * their confusable neighbours. Then `randomCount` other articles from the same window.
 */
export async function sampleMatchSet(
  db: Db,
  opts: { name: string; days: number; seeds: string[]; neighbourMin: number; randomCount: number },
): Promise<EvalSet> {
  const ids = new Set<string>()
  const window = sql`coalesce(a.published_at, a.first_seen_at) > now() - make_interval(days => ${opts.days})`
  for (const seed of opts.seeds) {
    const { rows } = await db.execute<{ id: string }>(sql`
      with seed as (
        select avg(e.embedding) as centre
        from article a
        join article_revision r on r.id = a.latest_revision_id
        join article_embedding e on e.article_id = a.id
        where ${window} and r.title ~* ${seed}
      )
      select a.id
      from article a
      join article_embedding e on e.article_id = a.id, seed
      where ${window} and seed.centre is not null
        and 1 - (e.embedding <=> seed.centre) >= ${opts.neighbourMin}`)
    for (const r of rows) ids.add(r.id)
  }
  const { rows: random } = await db.execute<{ id: string }>(sql`
    select a.id from article a
    join article_embedding e on e.article_id = a.id
    where ${window}
    order by random()
    limit ${opts.randomCount * 3}`)
  let added = 0
  for (const r of random) {
    if (added >= opts.randomCount) break
    if (ids.has(r.id)) continue
    ids.add(r.id)
    added++
  }

  const { rows } = await db.execute<Row>(sql`
    select a.id, p.name as publisher, p.kind, r.title, r.description,
      coalesce(a.published_at, a.first_seen_at) as at
    from article a
    join publisher p on p.id = a.publisher_id
    join article_revision r on r.id = a.latest_revision_id
    where a.id in ${sql`(${sql.join(
      [...ids].map((id) => sql`${id}`),
      sql`, `,
    )})`}
    order by at, a.id`)
  return {
    name: opts.name,
    createdAt: new Date().toISOString(),
    sample: {
      days: opts.days,
      seeds: opts.seeds,
      neighbourMin: opts.neighbourMin,
      randomCount: opts.randomCount,
    },
    articles: rows.map((r) => ({
      id: r.id,
      publisher: r.publisher,
      publisherKind: r.kind,
      title: r.title,
      description: r.description,
      publishedAt: new Date(r.at).toISOString(),
    })),
  }
}

export async function writeJson(file: string, value: unknown) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`)
}
