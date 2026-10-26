// Reconstruct saved matching runs without inference, then attribute placement errors
// to accepted Mammoth choices or Gemma fallbacks using the existing diagnosis rule.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, createPool } from '../packages/db/src/client.ts'
import { loadArticles } from '../packages/jobs/src/inputs.ts'
import { CANDIDATE_WINDOW_SECONDS, NEIGHBOURS } from '../packages/jobs/src/match.ts'
import { storyArticlesShown } from '../packages/jobs/src/match-core.ts'
import { bcubed, replayMatching } from '../packages/jobs/src/match-eval.ts'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dir = join(root, 'fixtures/decision-eval/results')
const runId = 'mammoth-hosted-20261026'
const set = JSON.parse(await readFile(join(root, 'fixtures/match-eval/set-1.json'), 'utf8'))
const labels = JSON.parse(
  await readFile(join(root, 'fixtures/match-eval/set-1.labels.json'), 'utf8'),
)
const gold = new Map(labels.groups.flatMap((g) => g.articleIds.map((id) => [id, g.id])))
const goldTitles = new Map(labels.groups.map((g) => [g.id, g.title]))
const connection = new URL(process.env.DATABASE_URL)
connection.searchParams.set(
  'options',
  '-c default_transaction_read_only=on -c statement_timeout=20000',
)
const pool = createPool(connection.toString())

try {
  const ids = set.articles.map((a) => a.id)
  const articles = await loadArticles(createDb(pool), ids)
  const byId = new Map(articles.map((a) => [a.articleId, a]))
  const vectors = await pool.query(
    'select article_id,embedding::text from article_embedding where article_id=any($1::text[])',
    [ids],
  )
  const embeddingOf = new Map(vectors.rows.map((r) => [r.article_id, JSON.parse(r.embedding)]))
  assert.equal(articles.length, ids.length)
  assert.equal(embeddingOf.size, ids.length)
  const replayArticles = set.articles.map((a) => ({
    id: a.id,
    publishedAt: a.publishedAt,
    embedding: embeddingOf.get(a.id),
  }))
  const audits = []
  for (const mode of ['replacement', 'probability95-fallback', 'gemma-baseline']) {
    const saved = JSON.parse(await readFile(join(dir, `${runId}.matching-${mode}.json`), 'utf8'))
    const baseline = mode === 'gemma-baseline'
    const requests = saved.requests.filter((r) => r.provider === 'local-gemma' && r.status === 200)
    const replayChoices = []
    const trace = []
    const candidateGroups = new Map()
    let index = 0
    const predicted = await replayMatching(
      replayArticles,
      saved.policy,
      { neighbours: NEIGHBOURS, windowSeconds: CANDIDATE_WINDOW_SECONDS },
      async () => {
        throw new Error('Unexpected sequential judging')
      },
      async (articleId, stories) => {
        let choice
        if (baseline) {
          const cached = JSON.parse(
            await readFile(
              join(
                root,
                'fixtures/match-eval/cache',
                runId,
                `gemma-${requests[index].requestHash}.json`,
              ),
              'utf8',
            ),
          )
          const output = JSON.parse(cached.data.choices[0].message.content)
          choice = {
            articleId,
            fallback: true,
            finalStoryId: output.choice === 0 ? null : stories[output.choice - 1]?.id,
          }
          assert.notEqual(choice.finalStoryId, undefined)
        } else {
          choice = saved.choices[index]
          assert.equal(choice.articleId, articleId)
        }
        index++
        replayChoices.push(choice)
        const shown = stories.map((s) =>
          storyArticlesShown(
            s.articleIds
              .map((id) => byId.get(id))
              .sort((a, b) => (a.publishedAt ?? '').localeCompare(b.publishedAt ?? '')),
            saved.policy.storyArticles,
          ).map((a) => a.articleId),
        )
        if (!baseline) assert.deepEqual(shown, choice.candidateArticleIds)
        candidateGroups.set(
          articleId,
          stories.map((s) => ({ storyId: s.id, articleIds: [...s.articleIds] })),
        )
        return choice.finalStoryId
      },
      trace,
    )
    assert.equal(index, baseline ? requests.length : saved.choices.length)
    const score = bcubed(predicted, gold)
    for (const key of ['precision', 'recall', 'f1'])
      assert(Math.abs(score[key] - saved.score[key]) < 1e-12)
    const choices = new Map(replayChoices.map((c) => [c.articleId, c]))
    const placed = new Map()
    const tallies = { mammoth: {}, gemma: {}, no_model: {} }
    const errors = []
    for (const step of trace) {
      const counts = new Map()
      for (const [id, storyId] of placed)
        if (gold.get(id) === gold.get(step.articleId))
          counts.set(storyId, (counts.get(storyId) ?? 0) + 1)
      const right = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
      let verdict = 'correct'
      if (!right) {
        if (step.method !== 'new_story')
          verdict = step.method === 'llm' ? 'wrongJoinByModel' : 'wrongJoinByEmbedding'
      } else if (step.storyId !== right) {
        if (step.method !== 'new_story') verdict = 'joinedWrongStory'
        else {
          const candidate = step.candidates.find((c) => c.storyId === right)
          verdict = !candidate ? 'notRetrieved' : !candidate.asked ? 'rankedTooLow' : 'modelSaidNo'
        }
      }
      const choice = choices.get(step.articleId)
      const source = !choice ? 'no_model' : choice.fallback ? 'gemma' : 'mammoth'
      tallies[source][verdict] = (tallies[source][verdict] ?? 0) + 1
      if (choice && verdict !== 'correct') {
        const selected = candidateGroups
          .get(step.articleId)
          ?.find((s) => s.storyId === step.storyId)
        errors.push({
          articleId: step.articleId,
          title: byId.get(step.articleId).title,
          labelledStory: goldTitles.get(gold.get(step.articleId)),
          source,
          verdict,
          ...(choice.mammoth
            ? {
                mammothChoice: choice.mammoth.choice,
                probability: choice.mammoth.probabilities[choice.mammoth.choice],
              }
            : {}),
          selectedStoryArticleTitles:
            selected?.articleIds.slice(0, 4).map((id) => byId.get(id).title) ?? [],
        })
      }
      placed.set(step.articleId, step.storyId)
    }
    audits.push({
      mode,
      score,
      tallies,
      errors,
      notes: [
        'No new inference calls. Mammoth saved article order and candidate evidence were verified; Gemma baseline choices were reconstructed from cached numeric outputs. All B-cubed scores were verified exactly.',
        'Error attribution uses the existing diagnose rule: the right Story is the predicted group holding most already-seen labelled mates.',
        'Labels are from the previously used model-drafted/manually-adjusted development set; these are not independently reviewed error rates.',
      ],
    })
  }
  await writeFile(
    join(dir, `${runId}.matching-audit.json`),
    `${JSON.stringify({ runId, audits }, null, 2)}\n`,
  )
  for (const audit of audits)
    console.log(
      JSON.stringify(
        {
          mode: audit.mode,
          tallies: audit.tallies,
          highestProbabilityMammothErrors: audit.errors
            .filter((e) => e.source === 'mammoth')
            .sort((a, b) => b.probability - a.probability)
            .slice(0, 5),
        },
        null,
        2,
      ),
    )
} finally {
  await pool.end()
}
