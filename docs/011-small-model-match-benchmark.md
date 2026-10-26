# 011: Small-model Story matching benchmark

**Date:** 2026-10-26

**Status:** Offline evaluation. No production model changes and no fine-tuning.

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

## Cascade follow-up

End-to-end cascade replays are the next part of this benchmark:

- **Positive-only:** accept a valid small-model attachment; otherwise ask the larger Gemma.
- **Negative-only:** accept a valid small-model "none" choice; otherwise ask the larger Gemma.
- Invalid small-model outputs always fall back. These are deliberately simple, uncalibrated policies, not claims that the accepted decisions are high-confidence.

Decisions already measured in the replacement runs can be reused only for the exact shown evidence. The original evaluation caches store synthetic Story IDs, which are not portable across different replay graphs. The cascade analysis must reconstruct each original replay and map its chosen Story to the signature of its shown articles before reusing it. New candidate contexts require new requests.

Original caches do not distinguish invalid answers from valid "none" choices. For any candidate replacement run with invalid outputs, cached "none" answers must therefore be re-requested before they can be accepted by a cascade.

Cascade timing totals should sum measured per-question costs for both stages, including reused decisions. Such totals are **estimates**, not physical end-to-end runs with cache lookup latency, and are not directly comparable to whole-run durations that include retry backoff. Server processing time is prompt time plus decode time, not a measurement of GPU utilization or energy.

Results and the final recommendation will be added after the cascade runs complete. None of the replacement results supports an unconditional production switch.

## Limitations and resumption

- No fine-tuning or new article-body collection was performed. This does not establish training rights; [010](010-match-classifier-research.md)'s licensing gate remains in effect.
- This set covers only a few event families and has been used repeatedly. Do not tune a gate on it and describe the resulting precision as held-out evidence.
- Political framing, language coverage, publication-order versus arrival-order effects, and performance on the unreviewed production samples need further evaluation before any deployment claim.
- A poor simple cascade does not prove that every calibrated or differently prompted gate is impossible. Conversely, a good result on this set is not enough to enable one.
- The evaluation wrappers and intermediate caches are temporary local experiment artifacts, not additions to the production CLI. Committed reports retain the protocol and per-request telemetry; a clean rerun requires the labelled set, its database metadata/embeddings, and a wrapper applying the request settings above around the existing replay harness.
