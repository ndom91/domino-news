# 011: Small-model Story matching benchmark

**Date:** 2026-10-26

**Status:** Complete: four replacement runs and six cascade runs. Keep the current production matcher; none of the tested cascades demonstrated both safe matching quality and lower inference cost. No production model changes and no fine-tuning.

This follows the alternatives discussed in [010](010-match-classifier-research.md): use an existing small instruction model before Gemma, without training on publisher material. The question is whether large-model requests can be avoided **without increasing false merges or total inference cost**.

## Protocol

- Dataset: `fixtures/match-eval/set-1.json`, 334 articles, 145 labelled Stories. Labels were originally model-drafted and manually adjusted; this is a previously used development set, not an independent held-out benchmark.
- Local database: all 334 articles and their existing `embeddinggemma-2` vectors were available. The production database no longer contained those IDs. Database connections explicitly enforced `default_transaction_read_only=on`; no pipeline jobs, memberships or production settings were changed.
- Matcher: the existing `runMatchEval` / `replayMatching` / `decideMatch` implementation, replaying publication order. Nearest 12 prior articles, four-day window, candidate minimum 0.72, auto-attach 0.93, up to five candidate Stories judged together. Story evidence is anchored on the first four and newest eight reports when more than 12 exist.
- Prompts: `choose-story@1`, with the existing system prompt and numbered-choice JSON schema. The report's inherited `promptVersion` field is `match-story@6`; `choosePromptVersion` explicitly records the prompt actually used by this choose-policy run.
- Requests: temperature **0**, `max_tokens=1200`, `chat_template_kwargs={"enable_thinking":false}`, `reasoning_effort="none"`, and `thinking_budget_tokens=0`. The standalone evaluation process overrode these fields before sending requests; the production adapter was not changed. This matters because that adapter normally sends temperature 0.2, overriding server defaults.
- Each model used a separate initially empty evaluation cache, outside the repository's historical cache directory. All four replacement runs made 226 logical model decisions with zero cache hits. Their candidate graphs diverge after different decisions, so this is an end-to-end comparison, not an identical-prompt microbenchmark.
- Models ran serially through the existing inference host, using the user's Vulkan llama.cpp deployment on Strix Halo. Concurrent production load, server build details, clocks and prompt-cache state were not controlled. Absolute latency is operational evidence, not a controlled hardware benchmark or energy measurement.
- Reports include dataset and current-article-metadata hashes, request-level usage and timing telemetry, finish reasons, reasoning-character counts and MTP counters. API keys, headers, request text and reasoning text are not recorded in that telemetry.

The endpoint IDs were `gemma-4-26B-A4B`, `ministral-3-3B`, `qwen3.5-4B` and `gemma-4-E4B`. Returned model filenames identify the larger Gemma as QAT UD-Q4_K_XL and the three candidates as Q8_0. Both Gemmas used MTP; speculative draft activity appeared in all 226 successful responses for each. The E4B run began after the user enabled `--spec-type draft-mtp --spec-draft-n-max 2` and restarted it.

## Replacement results

Reports: `fixtures/match-eval/results/set-1.small-model-*-greedy-budget0-20261026.json`.

| Model | B-cubed precision | Recall | F1 | Predicted Stories | Invalid outputs | Whole run | Median successful HTTP request |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Gemma 4 26B-A4B baseline | 82.5% | 83.9% | **83.2%** | 144 | 0 | 19.5 min | 3.91 s |
| Ministral 3 3B Instruct | 53.2% | 78.1% | 63.3% | 108 | 3 | 12.2 min | 2.93 s |
| Qwen3.5 4B | 62.0% | 91.4% | 73.9% | 120 | 1 | 12.0 min | 2.74 s |
| Gemma 4 E4B IT + MTP | 57.4% | 86.6% | 69.0% | 109 | 11 | 10.3 min | 2.56 s |

The baseline had four unsuccessful HTTP attempts followed by successful retries: 230 attempts for 226 logical decisions. Each smaller model had 226 HTTP attempts. An invalid output is an adapter validation failure, not necessarily a transport error or malformed JSON; Qwen had one token-limit finish. No successful response reported reasoning text under the explicit zero-budget protocol.

The smaller models' main problem was **over-merging**. Qwen was the strongest replacement by F1, but its 62.0% B-cubed precision is substantially below the baseline. The diagnosis counted 37 wrong joins of articles that should have started a new Story for Qwen, 47 for E4B and 48 for Ministral, versus 22 for the baseline. Additional wrong-existing-Story joins are counted separately in each report.

Faster standalone replacement is not enough to justify a prefilter. Adding the small model to every undecided article costs extra work, so its bypass rate must offset that work as well as preserve matching quality.

## Cascade results

All six end-to-end cascade replays completed:

- **Positive-only:** accept a valid small-model attachment; otherwise ask the larger Gemma.
- **Negative-only:** accept a valid small-model "none" choice; otherwise ask the larger Gemma.
- Invalid small-model outputs always fall back. These are deliberately simple, uncalibrated policies, not claims that the accepted decisions are high-confidence.

Decisions already measured in the replacement runs can be reused only for the exact shown evidence. The original evaluation caches store synthetic Story IDs, which are not portable across different replay graphs. The cascade analysis must reconstruct each original replay and map its chosen Story to the signature of its shown articles before reusing it. New candidate contexts require new requests.

Original caches do not distinguish invalid answers from valid "none" choices. For any candidate replacement run with invalid outputs, cached "none" answers must therefore be re-requested before they can be accepted by a cascade.

Cascade timing totals sum measured per-question costs for both stages, including reused decisions. Such totals are **estimates**, not physical end-to-end runs with cache lookup latency, and are not directly comparable to whole-run durations that include retry backoff. Server processing time is prompt time plus decode time, not a measurement of GPU utilization or energy. The baseline's successful requests sum to **757.7 seconds** of server-reported processing time; the relative processing estimates below use that denominator.

Reports: `fixtures/match-eval/results/set-1.cascade-*-greedy-budget0-20261026.json`.

| Small model | Accept small-model decisions only when | Precision | Recall | F1 | Large Gemma calls avoided | Logical small + large decisions | Estimated server processing vs baseline |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Ministral 3 3B | Positive match | 52.8% | 88.5% | 66.2% | 84.1% | 226 + 36 | 1.00× |
| Qwen3.5 4B | Positive match | 58.6% | 93.8% | 72.2% | 82.3% | 226 + 40 | 1.13× |
| Gemma 4 E4B | Positive match | 55.4% | 91.4% | 69.0% | 87.2% | 226 + 29 | 0.93× |
| Ministral 3 3B | No match | 86.2% | 78.1% | 82.0% | 11.9% | 226 + 199 | 1.87× |
| Qwen3.5 4B | No match | 85.5% | 83.1% | **84.3%** | **17.7%** | 226 + 186 | **1.98×** |
| Gemma 4 E4B | No match | 82.5% | 83.9% | 83.2% | 8.0% | 226 + 208 | 1.99× |

These replay policies have no learned confidence threshold. "Calls avoided" counts only the larger Gemma calls: total model decisions increased in every cascade. The inherited report `modelCalls` field counts top-level choose operations, not both stages; `smallDecisions`, `fallbackDecisions` and `logicalCalls` record the actual logical work.

**Positive-only gates are unsafe under the tested protocol.** They remove many larger-model calls by trusting exactly the attachments that cause the small models' over-merging. Falling back when the small model says "none" cannot repair an incorrect accepted attachment.

**Negative-only gates offer a quality/cost trade-off, not a compute saving.** Qwen is the most promising by quality: 84.3% F1 versus the fresh baseline's 83.2%, precision 85.5% versus 82.5%, and recall 83.1% versus 83.9%. Its cascade had 14 wrong joins of articles that should start a new Story, versus 22 for the baseline. That is a useful signal, but the roughly one-point F1 improvement is comparable in size to historical baseline variation and is not held-out proof of an improvement.

Qwen avoided only 40 of the 226 larger-model decisions. Its small stage added about **870.3 seconds** of server processing, while the remaining Gemma decisions cost **631.5 seconds**: approximately **1,501.9 seconds** in total, versus 757.7 for Gemma alone. It would need a substantially cheaper or more selective first stage to justify this policy on compute grounds.

Standalone replacement timings also understate some cascade workloads. For example, Qwen's negative-only small stage processed 966,085 prompt tokens, versus 779,178 in its replacement run. A less over-merged Story graph can expose more candidate evidence, so a faster replacement replay does not establish the cost of putting that model before Gemma.

### Timing caveat: client pauses and retries

The raw `estimatedSerialWallMs` for Ministral's negative-only cascade is about six hours. Several measured client-side calls took tens of minutes while their server-reported processing was only a few seconds. This is consistent with client suspension/pause or other external waiting, but the cause was not established. **Do not interpret that total as six hours of inference or a 20× slowdown.** The processing-time comparison above excludes that client-side wait; it still shows approximately 1.87× the baseline's server processing.

Transient HTTP retries occurred during the experiments and are recorded separately from logical decisions. Timing estimates assembled from successful response metrics do not include every failed attempt's processing or retry backoff. Shared production load and prompt-cache state remain uncontrolled, so the table supports a directional cost conclusion, not exact isolated-hardware speedups.

## Recommendation

**Keep Gemma 4 26B-A4B as the matcher. Do not add any of these three models as an always-run first stage using the tested prompt and gates.** No tested combination delivered both acceptable false-merge behavior and a lower processing-time estimate.

- Reject all three unconditional replacements and positive-only cascades on matching quality.
- Do not deploy the negative-only cascades as inference-cost optimizations: they reduce large-model calls but add substantially more total processing.
- Retain Qwen's negative-only result as a possible quality-oriented research lead, not a production recommendation. Investigate further only with a clear quality objective or a way to make the first stage much cheaper/more selective, followed by reviewed held-out event-family evaluation.
- These results do not rule out different prompts, calibrated abstention, narrower routing, or other small models. They do rule out assuming that a smaller model plus fallback is automatically cheaper or safe.

## Limitations and resumption

- No fine-tuning or new article-body collection was performed. This does not establish training rights; [010](010-match-classifier-research.md)'s licensing gate remains in effect.
- This set covers only a few event families and has been used repeatedly. Do not tune a gate on it and describe the resulting precision as held-out evidence.
- Political framing, language coverage, publication-order versus arrival-order effects, and performance on the unreviewed production samples need further evaluation before any deployment claim.
- A poor simple cascade does not prove that every calibrated or differently prompted gate is impossible. Conversely, a good result on this set is not enough to enable one.
- The evaluation wrappers and intermediate caches are temporary local experiment artifacts, not additions to the production CLI. Committed reports retain the protocol and per-request telemetry; a clean rerun requires the labelled set, its database metadata/embeddings, and a wrapper applying the request settings above around the existing replay harness.
