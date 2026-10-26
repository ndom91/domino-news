// Derive coverage and deployment-specific timing estimates without model calls or DB access.
import assert from 'node:assert/strict'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dir = join(root, 'fixtures/decision-eval/results')
const runId = 'mammoth-hosted-20261026'
const read = async (name) => JSON.parse(await readFile(join(dir, `${runId}.${name}.json`), 'utf8'))
const sum = (rows, get) => rows.reduce((total, row) => total + get(row), 0)
const wall = (r) => r.wallMs ?? 0
const server = (r) => (r.timings?.prompt_ms ?? 0) + (r.timings?.predicted_ms ?? 0)

function requestSummary(requests) {
  return Object.fromEntries(
    ['baseten', 'local-gemma'].map((provider) => {
      const rows = requests.filter((r) => r.provider === provider)
      const successful = rows.filter((r) => (r.status ?? 200) === 200)
      const times = successful.map(wall).sort((a, b) => a - b)
      const median = times.length
        ? (times[Math.floor((times.length - 1) / 2)] + times[Math.floor(times.length / 2)]) / 2
        : null
      return [
        provider,
        {
          logicalAttempts: rows.length,
          freshAttempts: rows.filter((r) => !r.reused).length,
          failedAttempts: rows.length - successful.length,
          estimatedLogicalWallMs: sum(rows, wall),
          medianSuccessfulRequestMs: median,
          localServerProcessingMs: provider === 'local-gemma' ? sum(successful, server) : null,
        },
      ]
    }),
  )
}

const controls = {}
for (const task of [
  'relationship-controls',
  'materiality-controls',
  'grounding-controls',
  'stance-controls',
]) {
  const data = await read(task)
  for (const row of data.cases) assert(row.expected && row.mammoth)
  controls[task] = {
    cases: data.cases.length,
    mammothCorrect: data.cases.filter((c) => c.expected.includes(c.mammoth.choice)).length,
    gemmaCompared: data.cases.filter((c) => c.gemma !== undefined).length,
    gemmaCorrect: data.cases.some((c) => c.gemma !== undefined)
      ? data.cases.filter((c) => c.expected.includes(c.gemma)).length
      : null,
    requests: requestSummary(data.requests),
  }
}

const relationships = {}
for (const profile of ['relationship-real', 'relationship-real-production']) {
  const data = await read(profile)
  const mammothCalls = data.requests.filter((r) => r.provider === 'baseten')
  const gemmaCalls = data.requests.filter((r) => r.provider === 'local-gemma' && r.status === 200)
  assert.equal(mammothCalls.length, data.cases.length)
  assert.equal(gemmaCalls.length, data.cases.length)
  const gemmaWall = sum(gemmaCalls, wall)
  const gemmaProcessing = sum(gemmaCalls, server)
  const policies = []
  for (const threshold of [0.9, 0.95, 0.99]) {
    for (const scope of ['all-decisions', 'unrelated-only']) {
      const accepted = new Set(
        data.cases.flatMap((c, index) => {
          const a = c.mammoth
          return a &&
            a.choice !== 'uncertain' &&
            a.probabilities[a.choice] >= threshold &&
            (scope === 'all-decisions' || a.choice === 'unrelated')
            ? [index]
            : []
        }),
      )
      const remaining = gemmaCalls.filter((_, index) => !accepted.has(index))
      const pipelineWall = sum(mammothCalls, wall) + sum(remaining, wall)
      const remainingProcessing = sum(remaining, server)
      policies.push({
        threshold,
        scope,
        accepted: accepted.size,
        coverage: accepted.size / data.cases.length,
        agreementWithGemma: [...accepted].filter(
          (i) => data.cases[i].mammoth.choice === data.cases[i].gemma,
        ).length,
        estimatedPipelineWallMs: pipelineWall,
        estimatedWallRatio: pipelineWall / gemmaWall,
        remainingLocalServerProcessingMs: remainingProcessing,
        localServerProcessingReduction: 1 - remainingProcessing / gemmaProcessing,
      })
    }
  }
  relationships[profile] = {
    cases: data.cases.length,
    unavailable: data.cases
      .filter((c) => !c.mammoth)
      .map((c) => ({ id: c.id, error: c.mammothError })),
    evaluated: data.cases.filter((c) => c.mammoth).length,
    agreementWithGemma: data.cases.filter((c) => c.mammoth && c.mammoth.choice === c.gemma).length,
    independentAccuracy: null,
    requests: requestSummary(data.requests),
    policies,
  }
}

const baseline = await read('matching-gemma-baseline')
const replacement = await read('matching-replacement')
const cascade = await read('matching-probability95-fallback')
const audit = await read('matching-audit')
const baselineMetrics = requestSummary(baseline.requests)
const cascadeMetrics = requestSummary(cascade.requests)
const accepted = new Set(cascade.choices.filter((c) => !c.fallback).map((c) => c.articleId))
const baselineErrors = new Map(
  audit.audits.find((a) => a.mode === 'gemma-baseline').errors.map((e) => [e.articleId, e]),
)
const cascadeErrors = audit.audits
  .find((a) => a.mode === 'probability95-fallback')
  .errors.filter((e) => e.source === 'mammoth')
assert.equal(cascade.choices.length, 226)
assert.equal(accepted.size + cascade.fallbackDecisions, 226)
const matching = {
  baselineScore: baseline.score,
  replacementScore: replacement.score,
  cascadeScore: cascade.score,
  acceptedByMammoth: accepted.size,
  fallbackDecisions: cascade.fallbackDecisions,
  largeModelCallsAvoided: accepted.size / cascade.choices.length,
  acceptedPlacementErrors: cascadeErrors,
  baselineErrorsOnSameArticleSubset: [...accepted].filter((id) => baselineErrors.has(id)).length,
  f1Difference: cascade.score.f1 - baseline.score.f1,
  precisionDifference: cascade.score.precision - baseline.score.precision,
  baselineRequests: baselineMetrics,
  cascadeRequests: cascadeMetrics,
  estimatedWallRatio:
    (cascadeMetrics.baseten.estimatedLogicalWallMs +
      cascadeMetrics['local-gemma'].estimatedLogicalWallMs) /
    baselineMetrics['local-gemma'].estimatedLogicalWallMs,
  localServerProcessingReduction:
    1 -
    cascadeMetrics['local-gemma'].localServerProcessingMs /
      baselineMetrics['local-gemma'].localServerProcessingMs,
  notes: [
    'The timing ratio combines measured per-question latencies from different deployments and includes reused answers; it is not same-hardware compute or dollar cost.',
    'The article-subset comparison comes from different replay trajectories, not identical candidate contexts.',
    'The predeclared gate shows a useful trade-off on an already-used development set; this is not held-out production validation.',
  ],
}

const cacheDir = join(root, 'fixtures/match-eval/cache', runId)
const cachedNames = (await readdir(cacheDir)).filter((name) => name.startsWith('mammoth-'))
const cacheMetrics = []
for (const name of cachedNames)
  cacheMetrics.push(JSON.parse(await readFile(join(cacheDir, name), 'utf8')).metric)
const analysis = {
  runId,
  controls,
  relationships,
  matching,
  distinctSuccessfulHostedRequestsCached: cacheMetrics.length,
  distinctHostedInputTokensCached: sum(cacheMetrics, (r) => r.usage?.input_tokens ?? 0),
  notes: [
    'No model calls or database writes in this analysis.',
    'Relationship policies are post-run cost simulations at predeclared probability thresholds, not live graph-update replays.',
    'Independent real-pair correctness is unknown; agreement with Gemma is not accuracy.',
    'The initial real relationship profile omitted summaries through the matching loader; the production-profile result supersedes it for recommendations.',
    'Cached-success totals exclude connectivity probes, interrupted-run failures and final recorded length refusals; they are not a provider billing audit.',
  ],
}
await writeFile(join(dir, `${runId}.analysis.json`), `${JSON.stringify(analysis, null, 2)}\n`)
console.log(
  JSON.stringify(
    {
      controls,
      productionRelationshipPolicies: relationships['relationship-real-production'].policies,
      matching: {
        baseline: matching.baselineScore,
        cascade: matching.cascadeScore,
        accepted: accepted.size,
        errors: cascadeErrors.length,
        largeModelCallsAvoided: matching.largeModelCallsAvoided,
        estimatedWallRatio: matching.estimatedWallRatio,
        localServerProcessingReduction: matching.localServerProcessingReduction,
      },
    },
    null,
    2,
  ),
)
