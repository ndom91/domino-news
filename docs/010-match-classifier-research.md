# 010: Deferred research — cheaper Story matching

**Date:** 2026-10-26  
**Status:** Deferred proposal, not an implementation decision. Training rights for the available publisher data are unresolved. Do not train or fine-tune on it until permission has been established for the intended use.

## Goal

Investigate whether a small, specialized text-pair classifier can safely replace some Gemma Story-matching decisions. This would reduce large-model requests, not eliminate AI inference. Reports may arrive hours apart and use different wording while describing the same development.

The definition of a Story remains [story-granularity.md](story-granularity.md). A false merge can contaminate a summary, so a classifier must be able to abstain and leave difficult decisions to the existing matcher.

**Subsequent no-fine-tuning experiment:** [011](011-small-model-match-benchmark.md) records four instruction-model replacement runs and six fallback cascades. None of those tested cascades delivered both acceptable matching quality and a lower processing-time estimate. That does not evaluate or clear the proposed trained classifier below.

## What previous experiments showed

The committed reports in `fixtures/match-eval/results/` and the evaluation section of [006](006-implementation-notes.md) provide the baseline:

| Experiment on set-1 | Precision | Recall | F1 | Logical model decisions |
| --- | --- | --- | --- | --- |
| Gemma, five candidates together | 82.1% | 85.9% | 84.0% | 226 |
| Gemma, fresh repeat | 81.5% | 84.3% | 82.9% | 226 |
| Laya System One | 39.1% | 93.7% | 55.2% | 226 |
| Kev compact, safe options | 92.6% | 64.9% | 76.3% | 226 |
| Gemma, candidate threshold 0.74 | 87.3% | 79.2% | 83.0% | 221 |
| Gemma, candidate threshold 0.75 | 87.8% | 74.8% | 80.8% | 220 |
| Gemma, weak-tail pruning at 0.03 | 77.5% | 75.5% | 76.5% | 226 |

Logical decisions count fresh calls plus cached answers in the replay; they are not the number of new HTTP requests made by each experiment. System One rows are replacement experiments, not measurements of an end-to-end fallback cascade.

Broad replacement over-merged, while conservative replacement fragmented coverage. Raising similarity thresholds saved few decisions. The useful distinction is event identity, not merely shared actors, vocabulary or topic.

## Production arrival timing: batching is not the leading approach

A read-only inspection on 2026-10-26 examined production at `pve6-docker:/opt/ndomino/domino-news`. The database contained 32,627 articles from 72 publishers, spanning October 11–26. The analysis used the last complete UTC week, October 19–25, and `article.first_seen_at` rather than publisher timestamps.

Among 1,355 Stories first ingested that week that had gained a second newsroom publisher by the snapshot:

| Second publisher arrived within | Share |
| --- | --- |
| 1 minute | 5.4% |
| 15 minutes | 9.0% |
| 30 minutes | 15.2% |
| 1 hour | 25.9% |
| 3 hours | 46.4% |

The median wait was about **3 hours 44 minutes**. Across successive newsroom reports in existing Stories during the week, the median gap was about two hours.

An optimistic same-Story batching simulation considered matched newsroom articles with recorded Gemma matching runs. It excluded articles whose publication timestamp was more than six hours before ingestion; that is an analysis cutoff, not the configured fresh/backfill threshold. The resulting cohort contained 14,367 articles. Batches started at the first included arrival, did not extend their window with each follower, and contained at most eight articles.

| Collection window | Matching decisions potentially combined |
| --- | --- |
| 30 seconds | 3.4% |
| 1 minute | 3.5% |
| 5 minutes | 3.5% |
| 15 minutes | 5.5% |
| 30 minutes | 8.7% |
| 1 hour | 13.0% |

Production polls feeds every 15 minutes, with arrivals concentrated near the start of each cycle. Waiting several extra minutes captures little additional coverage. The last three complete days showed similar results.

These are exploratory estimates, not demonstrated request, token or GPU savings. They assume knowledge of final Story assignments and successful joint decisions without additional calls. Current Story membership is model-produced, not an independently reviewed answer key; later arrivals can also change the second-publisher statistics. This measures same-Story overlap, not joint processing of different developments sharing candidate context. The metadata snapshot and analysis were not added as a reproducible benchmark to the repository.

**Conclusion:** do not prioritize arrival batching as the main optimization on this evidence. Exact title/description reuse also remains unmeasured and is likely narrow: different publishers usually express the same facts differently.

## Proposed experiment: a small text-pair classifier

A cross-encoder reads the incoming article and a candidate Story together, rather than comparing independently generated embeddings. Fine-tune a suitable pretrained encoder to distinguish:

- **Same development:** different wording, angles or updated figures about the same event.
- **Different development:** a separate event, response, consequence or analysis under the granularity rules.

Abstention is a calibrated decision policy around classifier scores, not an unverified model claim of confidence. No encoder, runtime, thresholds or production service have been selected. Multilingual coverage, input limits, model licensing and measured serving cost must inform that choice.

### Dataset

Each example needs the incoming headline and RSS description, a bounded selection of the candidate Story's anchored reports available at decision time, and a reviewed same/different label. Retain the paired text: similarity, token overlap, dates and counts alone discard important semantic distinctions.

Prioritize hard negatives: first versus second attack, attack versus airport closure, announcement versus criticism, and related actions by the same actor. Include positives with different wording, political framing and languages. Random unrelated pairs alone are insufficient.

Existing scaffolding:

- `fixtures/match-eval/set-1`: 334 articles with accepted grouping originally drafted by a model and manually adjusted; useful, but not unquestionable ground truth.
- Iran, France and Brazil production samples: their `.labels.model.json` files are explicitly model-authored seeds, not independent reviewed labels.
- `packages/jobs/src/match-gate-eval.ts`: candidate-level examples and gate scoring. Its examples use oracle Story membership, which differs from the evolving production graph.
- `packages/jobs/src/match-eval.ts` and `match-core.ts`: offline replay and the shared matching decision core.

A few thousand reviewed candidate pairs across several event families is a starting experiment, not a proven sufficient dataset size. Reviewing Story groups can establish many pair labels, with ambiguous boundaries reviewed individually. Expand only if learning curves justify it.

### Potential bypass policy

Evaluate the positive and negative paths separately:

| Situation | Potential action |
| --- | --- |
| One strongly supported match and confidently rejected competitors | Attach without Gemma |
| All candidates confidently rejected | Start a new Story without Gemma |
| Ambiguous, unsupported or out-of-distribution input | Use the existing Gemma matcher |

Calibrate thresholds on held-out data. A classifier score is not automatically a trustworthy probability. Any eventual integration must retain current revision, candidate-freshness and transactional checks; match-admission followers must not simply inherit their leader's Story.

### Evaluation and go/no-go criteria

1. Split by event family and time, not random pairs, to prevent near-duplicate coverage leaking between training and testing.
2. Report precision versus coverage for each bypass path, especially false attachments.
3. Replay the full matcher in arrival order where available. Earlier errors change later candidate Stories; oracle pair accuracy alone is insufficient.
4. Measure B-cubed precision/recall, false merges, fragmentation, Gemma calls avoided, fallback/retry rates, latency and total compute cost including the classifier.
5. If offline results justify further work, shadow production without allowing classifier assignments before enabling any bypass.

An offline dataset and precision-versus-coverage curve are the first deliverables. Agree an acceptable error tolerance before choosing thresholds. If safe coverage or net compute savings are poor, stop rather than build another production gate. Training may need temporary GPU access; CPU serving is a hypothesis to benchmark, not a requirement or established capability.

## Licensing gate and resumption checklist

Permission to ingest metadata or process an article transiently does **not** establish permission to train a model. Existing source-policy reviews and [008](008-third-party-data-licensing.md) are context, not clearance for this proposal.

Before creating training artifacts or running fine-tuning:

- Establish and document source-by-source rights for training, evaluation, retention and the intended commercial or non-commercial deployment.
- Include labels derived from publisher material in that review; model-generated labels do not remove underlying data-use restrictions.
- Verify the pretrained model's license and any restrictions on use or distribution of fine-tuned weights.
- Exclude sources without established permission. Do not persist transient article bodies for this experiment.
- Define dataset provenance, permitted access, retention and deletion handling.

If rights remain unclear, keep this work deferred. A cleared subset might support an initial experiment, but its coverage and representativeness would need explicit evaluation. This document authorizes neither training nor new collection, infrastructure or production changes.
