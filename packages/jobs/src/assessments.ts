import { type Db, schema, withTransaction } from '@dn/db'
import { ID_PREFIX, newId } from '@dn/domain'
import type { PublisherLean } from '@dn/schemas'
import { eq } from 'drizzle-orm'
import type pg from 'pg'
import { leanEvidenceRow, loadLeanEvidence } from './lean-evidence.ts'

// Evidence for publisher assessments, from open sources only:
// - Wikidata (CC0): owners and what kind of entity they are, plus the community-edited
//   "political alignment" (P1387), kept as weak evidence for lean.
// - Wikipedia's perennial sources list (CC BY-SA): the community reliability label.
// - Hand-checked lean ratings from AllSides and the Reuters Institute (see lean-evidence.ts).
// Nothing here is shown to readers until an admin reviews it into an assessment.

// Wikimedia's API policy wants a descriptive user agent with a contact URL; generic ones get 429s.
const UA = 'DominoNews/0.1 (https://github.com/ndom91/domino-news; publisher assessments)'
const RSP_PAGE = 'Wikipedia:Reliable sources/Perennial sources'
const RSP_URL = 'https://en.wikipedia.org/wiki/Wikipedia:Reliable_sources/Perennial_sources'

type EvidenceRow = {
  source: 'wikidata' | 'wp_rsp' | 'allsides' | 'reuters_dnr'
  dimension: 'ownership' | 'reliability' | 'lean'
  value: string
  url: string
  lean?: PublisherLean | null
  countryContext?: string | null
}

const RSP_STATUS: Record<string, string> = {
  gr: 'Generally reliable',
  nc: 'No consensus',
  m: 'Mixed by topic',
  gu: 'Generally unreliable',
  d: 'Deprecated',
  b: 'Blacklisted',
}

type RspEntry = { name: string; status: string; domains: string[] }

/** Rows of the perennial sources table: status from the row class, domains from RSPUSES. */
export function parseRspWikitext(wikitext: string): RspEntry[] {
  return wikitext.split(/^\|-/m).flatMap((row) => {
    const status = row.match(/^\s*class="s-(\w+)/)?.[1]
    const uses = row.match(/\{\{WP:RSPUSES\|([^}]*)\}\}/)?.[1]
    if (!status || !RSP_STATUS[status] || !uses) return []
    const name =
      row.match(/''\[\[(?:[^\]|]*\|)?([^\]]+)\]\]''/)?.[1] ?? row.match(/\[\[([^\]|]+)/)?.[1] ?? ''
    return [{ name, status: RSP_STATUS[status], domains: uses.split('|').map((d) => d.trim()) }]
  })
}

/** Matches a publisher domain to an RSP entry: the same host, ignoring "www.". */
export function findRspEntry(entries: RspEntry[], domain: string) {
  const host = domain.replace(/^www\./, '')
  return entries.find((e) => e.domains.some((d) => d.replace(/^www\./, '').split('/')[0] === host))
}

/** GET JSON, backing off on 429 as Wikimedia asks (Retry-After, else 5 s; 3 tries). */
async function getJson(url: string, attempt = 1): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    headers: { 'user-agent': UA },
    signal: AbortSignal.timeout(20_000),
  })
  if (res.status === 429 && attempt < 3) {
    const wait = Number(res.headers.get('retry-after')) || 5
    await new Promise((r) => setTimeout(r, wait * 1000))
    return getJson(url, attempt + 1)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return (await res.json()) as Record<string, unknown>
}

const wikiApi = (params: Record<string, string>) =>
  `https://en.wikipedia.org/w/api.php?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`

async function fetchRspEntries(): Promise<RspEntry[]> {
  const index = (await getJson(
    wikiApi({ action: 'parse', page: RSP_PAGE, prop: 'templates' }),
  )) as {
    parse?: { templates?: { title: string }[] }
  }
  // The table lives in numbered subpages transcluded by the main page.
  const subpages = (index.parse?.templates ?? [])
    .map((t) => t.title)
    .filter((t) => t.startsWith(`${RSP_PAGE}/`) && !/\/(styles\.css|Status|Last|Uses)$/.test(t))
  const entries: RspEntry[] = []
  for (const page of subpages) {
    const data = (await getJson(
      wikiApi({ action: 'parse', page, prop: 'wikitext', redirects: '1' }),
    )) as { parse?: { wikitext?: string } }
    entries.push(...parseRspWikitext(data.parse?.wikitext ?? ''))
  }
  return entries
}

type WdEntity = {
  id: string
  labels?: Record<string, { value: string }>
  claims?: Record<string, { mainsnak: { datavalue?: { value: unknown } } }[]>
}

const wdApi = (params: Record<string, string>) =>
  `https://www.wikidata.org/w/api.php?${new URLSearchParams({ format: 'json', ...params })}`

const claimIds = (e: WdEntity, prop: string) =>
  (e.claims?.[prop] ?? []).flatMap((c) => {
    const v = c.mainsnak.datavalue?.value as { id?: string } | undefined
    return v?.id ? [v.id] : []
  })

const claimStrings = (e: WdEntity, prop: string) =>
  (e.claims?.[prop] ?? []).flatMap((c) => {
    const v = c.mainsnak.datavalue?.value
    return typeof v === 'string' ? [v] : []
  })

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

async function getEntities(ids: string[]): Promise<Record<string, WdEntity>> {
  if (ids.length === 0) return {}
  const data = (await getJson(
    wdApi({
      action: 'wbgetentities',
      ids: ids.join('|'),
      props: 'labels|claims',
      languages: 'en|mul|de|fr|es|pt|ru',
    }),
  )) as { entities?: Record<string, WdEntity> }
  return data.entities ?? {}
}

/** The Wikidata item for a publisher: searched by name, confirmed by its official website. */
async function findWikidataEntity(name: string, domain: string): Promise<WdEntity | null> {
  const search = (await getJson(
    wdApi({ action: 'wbsearchentities', search: name, language: 'en', limit: '7' }),
  )) as { search?: { id: string }[] }
  const entities = await getEntities((search.search ?? []).map((s) => s.id))
  const host = domain.replace(/^www\./, '')
  return (
    Object.values(entities).find((e) =>
      claimStrings(e, 'P856').some((site) => {
        const h = hostOf(site)
        return h === host || h.endsWith(`.${host}`)
      }),
    ) ?? null
  )
}

// English first, then any label (some owners, e.g. DW's, have no English one).
const label = (e: WdEntity | undefined) =>
  e?.labels?.en?.value ?? e?.labels?.mul?.value ?? Object.values(e?.labels ?? {})[0]?.value

/** Evidence rows from a publisher's Wikidata item and the entities it points to. */
export function wikidataEvidence(item: WdEntity, related: Record<string, WdEntity>): EvidenceRow[] {
  const url = `https://www.wikidata.org/wiki/${item.id}`
  const rows: EvidenceRow[] = []
  for (const ownerId of claimIds(item, 'P127')) {
    const owner = related[ownerId]
    const kinds = owner
      ? claimIds(owner, 'P31')
          .map((k) => label(related[k]))
          .filter(Boolean)
      : []
    const name = label(owner) ?? ownerId
    // One more hop: a network's own owner is often the telling part (e.g. a state).
    const parents = owner ? claimIds(owner, 'P127').map((id) => label(related[id]) ?? id) : []
    const kind = kinds.length ? ` (${kinds.join(', ')})` : ''
    const parent = parents.length ? `, itself owned by ${parents.join(', ')}` : ''
    rows.push({
      source: 'wikidata',
      dimension: 'ownership',
      value: `Owned by ${name}${kind}${parent}`,
      url,
    })
  }
  for (const id of claimIds(item, 'P1387')) {
    const alignment = label(related[id])
    if (alignment) {
      rows.push({
        source: 'wikidata',
        dimension: 'lean',
        value: `Political alignment (community-edited, unsourced): ${alignment}`,
        url,
      })
    }
  }
  return rows
}

async function publisherWikidataEvidence(name: string, domain: string) {
  const item = await findWikidataEntity(name, domain)
  if (!item) return []
  const owners = claimIds(item, 'P127')
  const related = await getEntities([...owners, ...claimIds(item, 'P1387')])
  // Labels for what each owner is (government, company, foundation…) and who owns it.
  const nextIds = owners.flatMap((o) =>
    related[o] ? [...claimIds(related[o], 'P31'), ...claimIds(related[o], 'P127')] : [],
  )
  Object.assign(related, await getEntities([...new Set(nextIds)].slice(0, 50)))
  return wikidataEvidence(item, related)
}

/** Refresh imported evidence for every publisher. Each publisher is replaced atomically. */
export async function importAssessmentEvidence(
  ctx: { db: Db; pool: pg.Pool; config: { fixtureDir: string } },
  log: (msg: string) => void = () => {},
) {
  const { db } = ctx
  // Read the hand-checked file first, so a typo in it fails before any network calls.
  const checked = await loadLeanEvidence(ctx.config.fixtureDir)
  log(`hand-checked lean ratings: ${checked.length} entries`)
  const rsp = await fetchRspEntries()
  log(`perennial sources: ${rsp.length} entries`)
  const publishers = await db.select().from(schema.publisher)
  const unknown = checked.filter((e) => !publishers.some((p) => p.slug === e.publisher))
  for (const e of unknown) log(`lean-evidence.json: no publisher "${e.publisher}"`)
  const now = new Date()
  let rows = 0
  for (const p of publishers) {
    const evidence: EvidenceRow[] = []
    const entry = findRspEntry(rsp, p.domain)
    if (entry) {
      evidence.push({
        source: 'wp_rsp',
        dimension: 'reliability',
        value: `${entry.status} (Wikipedia perennial sources: ${entry.name})`,
        url: RSP_URL,
      })
    }
    evidence.push(...checked.filter((e) => e.publisher === p.slug).map(leanEvidenceRow))
    try {
      evidence.push(...(await publisherWikidataEvidence(p.name, p.domain)))
    } catch (error) {
      log(`wikidata failed for ${p.slug}: ${String(error)}`)
    }
    await withTransaction(ctx.pool, async (tx) => {
      await tx.db
        .delete(schema.publisherEvidence)
        .where(eq(schema.publisherEvidence.publisherId, p.id))
      if (evidence.length > 0) {
        await tx.db.insert(schema.publisherEvidence).values(
          evidence.map((e) => ({
            id: newId(ID_PREFIX.publisherEvidence),
            publisherId: p.id,
            retrievedAt: now,
            ...e,
          })),
        )
      }
    })
    rows += evidence.length
    log(`${p.slug}: ${evidence.length} evidence rows`)
  }
  return { publishers: publishers.length, evidence: rows }
}
