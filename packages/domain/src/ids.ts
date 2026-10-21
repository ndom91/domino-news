const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

// Time-sortable, prefixed IDs (ULID-like, lowercase Crockford base32).
export function newId(prefix: string, now = Date.now()): string {
  let time = ''
  let t = now
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time
    t = Math.floor(t / 32)
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let rand = ''
  for (const b of bytes) rand += ALPHABET[b % 32]
  return `${prefix}_${time}${rand}`
}

export const ID_PREFIX = {
  publisher: 'pub',
  feed: 'fd',
  feedEntry: 'fe',
  article: 'art',
  articleRevision: 'rev',
  observation: 'obs',
  story: 'sty',
  storyArticle: 'sa',
  storyRelationship: 'rel',
  narrative: 'nar',
  sourceReference: 'src',
  analysisRun: 'run',
  interpretation: 'int',
  summaryVersion: 'sum',
  publisherEvidence: 'pev',
  publisherAssessment: 'pas',
  claim: 'clm',
  contextEntry: 'ctx',
  contextEntryVersion: 'ctxv',
  pushDelivery: 'pdl',
  storyUpdateEvent: 'sue',
  storyUpdateEventSource: 'sues',
} as const
