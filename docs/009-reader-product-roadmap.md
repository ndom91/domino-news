# 009 — Reader Product Roadmap

**Date:** 2026-10-21  
**Status:** Agreed product direction; implementation is not yet planned in detail  
**Related:** [`001-data-model.md`](001-data-model.md), [`004-frontend-platform.md`](004-frontend-platform.md), [`006-implementation-notes.md`](006-implementation-notes.md)

## 1. Product direction

Domino Wire should become a reader's primary news home: a place to understand what matters, see what changed, compare how a story is covered, and control the inputs to a personal news feed.

Its distinguishing promise is not an opaque recommendation feed or an assertion that it independently verifies every reported fact. It is transparent, source-linked understanding:

> **Domino Wire tells readers what changed, who is reporting it independently, what evidence is available, and what they may be missing.**

The existing foundation remains central:

- Story is the canonical unit; a Story is one discrete development.
- Narratives connect related developments over time.
- Generated summaries, context, claims, and comparisons must remain grounded in linked source observations and references.
- Publisher assessments describe the publisher in its own country context; they are not truth scores and must not be used to infer a reader's political identity.
- The app does not retain third-party article bodies except for permitted, transient processing.

## 2. Information architecture

The product should have two complementary reader destinations, not separate Front Page, Daily Briefing, and For You top-level experiences.

### Front Page (`/`)

A shared, reader-neutral view of the most important developing Stories. It remains useful for discovery and for readers who have not yet expressed preferences.

### Briefing (`/briefing`)

A new personalized, time-aware view that answers: **“What matters to me, and what changed since I last visited?”**

The existing For You ranking becomes a section and ranking input within Briefing, rather than a standalone product destination. Existing preferences, follows, feedback, learned signals, and opt-in reading history are reused rather than duplicated.

Briefing initially remains in-app only. Email digests, push notifications, and other delivery channels are deferred.

## 3. Agreed Briefing decisions

| Decision | Choice | Reasoning |
| --- | --- | --- |
| Route | Add `/briefing`; keep `/` as the Front Page for now | Allows evaluation before changing the signed-in default destination |
| Personalisation breadth | Include a restrained “Outside your usual coverage” section by default | Avoids a filter bubble while keeping the decision explicit and explainable |
| Muted publishers | Suppress that publisher as a source; do not hide a Story when other publishers cover it | Lets readers control sources without removing independently useful coverage |
| Since-last-visit baseline | Store one `briefing_last_opened_at` checkpoint on the existing reader-preferences row | better-auth refreshes session timestamps on a 24-hour cadence, so they do not accurately represent individual Briefing opens |
| Delivery | In-app only | Validate the Briefing before adding email consent, scheduling, and delivery infrastructure |

The checkpoint stores only the latest successful Briefing-open time. It is not reading history and records no individual Stories, navigation, devices, or visit log. The server reads the old value and advances it in one database operation; the old value is the comparison boundary displayed by the current response.

## 4. Priority roadmap

### High priority — establish a daily-use, explainable news home

#### 4.1 Unified Briefing

Potential sections:

- **Since your last visit:** meaningful updates to Stories and Narratives the reader opened, saved, or follows.
- **The essential stories:** important developments that are not dependent on reader preferences.
- **For you:** Stories selected through the existing ranking inputs: follows, topic/desk/region preferences, feedback, coverage, and recency.
- **Outside your usual coverage:** important, deliberately broadening Stories.
- **Following:** updates to followed Narratives and publishers; subject follows are a later extension.

Readers should be able to control regions, desks, topics, followed/muted publishers, future source collections, and breadth. Every personalized item needs a concise, inspectable “Why am I seeing this?” explanation.

#### 4.2 Story and Narrative update ledger

Stories and Narratives should make change legible through a chronological **What changed** ledger. Candidate event types:

- `new_reporting`
- `official_response`
- `consequence`
- `new_primary_source`
- `correction_or_clarification`
- `analysis`
- `summary_revision`

Each event should include a short grounded explanation, source links, timestamps, and a clear indication of the available coverage/uncertainty. This also enables a “Catch me up” experience for developing Stories and Narratives, and supplies the meaningful update records needed by Briefing.

#### 4.3 Compare Coverage

Make story-level comparative coverage a flagship feature. The view should organize sources by publisher country, ownership, assessment/lean context, and source type, while retaining links to each source.

It should carefully distinguish:

- reporting broadly shared across linked sources
- claims or details emphasized differently
- attributed or disputed claims
- visible coverage gaps
- rated and unrated publishers

The existing story lean mix should become an entry point to this richer view rather than a standalone visualization. The comparison describes coverage; it does not judge which political position is true.

#### 4.4 Transparent source portfolio and feed controls

Readers should control their source portfolio and see the effects of their choices:

- follow and mute publishers
- future source collections, such as public broadcasters or specialist science publishers
- topic, desk, region, and publisher preferences
- a clearly explained breadth control, including a “Broaden my briefing” mode
- inspectable and resettable learned feedback signals

#### 4.5 Primary-source expansion

Expand beyond RSS news metadata with reviewed, high-value primary-source connectors, beginning with suitable official sources:

- government announcements
- legislation and regulatory material
- court opinions
- public filings
- public datasets
- official transcripts and statements

Each connector needs source-specific permission, retention, and processing decisions. Do not replace this with broad uncontrolled scraping. Discovered primary sources should be prominent on Story pages, update ledgers, and Compare Coverage.

### Medium priority — deepen trust and reader workflow

#### 4.6 Reporting independence and provenance

Show publisher count separately from conservative, evidence-based reporting provenance. Start with explicit signals only: wire/syndication labels, named originators, links, and identified use of official sources.

Potential reader-facing language:

- “12 publishers covered this”
- “3 known independent reporting chains”

Do not infer broad independence or derivation aggressively. Any later semantic inference must be visibly labelled with its confidence and methodology.

#### 4.7 Corrections, uncertainty, and material changes

The metadata-only policy limits what can be established about an individual article change. Safe initial signals include:

- an RSS title or description changed
- an explicit correction signal available in source metadata
- a linked correction/clarification Story
- a later report describes a revised figure
- a newly discovered primary source or official response
- a material Domino summary revision caused by changes to its source set

Do not claim that a publisher corrected or retracted an article without a specific observable signal. Prefer precise language such as “Later reports describe a revised figure.”

#### 4.8 Subject follows and alerts

Let readers follow canonical people, places, organisations, policies, elections, companies, and court cases. Start with conservative extraction, canonical identifiers and aliases, and in-app Briefing updates. Email and push alerts are deferred.

#### 4.9 Saved reading and research tools

Add saves for Stories and Narratives, a read-later queue, read/unread state, private notes, and export of saved links/notes in an interoperable format.

### Low priority — broaden scope after the core experience is proven

#### 4.10 Local and civic coverage

Add opt-in locality, local publishers, public notices, and a separate local desk only after a curated source-acquisition and privacy strategy is in place.

#### 4.11 Native mobile and push

The server and Android/Expo groundwork are already in place. Build the native reader after Briefing, updates, saves, and notification contracts have settled. Initial scope: Briefing, Story/Narrative, search, saves, follows, then push notifications.

#### 4.12 Multilingual and broader specialist coverage

Make the English-first experience excellent before prioritizing translation or cross-language presentation. Expand newsletters and specialist publications only after source rights and ingestion contracts are clear.

## 5. Shared foundations and overlap

| Foundation | Features it supports |
| --- | --- |
| Preferences, follows, feedback, and opt-in reading history | Briefing, source portfolio, breadth controls, subject follows, future alerts |
| Story summary versions, relationships, claims, and sources | Update ledger, catch-up, corrections, Compare Coverage |
| Publisher assessments, ownership evidence, and source type | Compare Coverage, portfolio controls, provenance display |
| Source references and primary-source connectors | Compare Coverage, primary-source display, provenance, update types |
| Typed API contracts and shared queries | Web now; native and delivery channels later |

New work should extend these shared foundations instead of creating a separate recommendation system, independent activity tracker, or duplicated web/mobile behavior.

## 6. Delivery sequence

### Release A — Briefing foundations

1. Define the canonical preference model for regions, desks, topics, publisher following/muting, source collections, and breadth.
2. Implement a Briefing read model and API from existing Front Page and For You capabilities.
3. Build `/briefing`; migrate or redirect the existing `/for-you` entry point.
4. Add ranking explanations, onboarding, empty states, and muted-publisher behavior.
5. Verify the feasibility and semantics of reusing the better-auth session timestamp for the comparison window.

### Release B — understand change

1. Design and add a small append-only update-event model derived from pipeline events and source/summary changes.
2. Ship the Story-level update ledger and catch-up summary.
3. Aggregate events into Narrative timelines.
4. Use update events to power Briefing’s “Since your last visit” section.

### Release C — compare coverage and primary sources

1. Define a grounded comparison schema and create evaluation fixtures.
2. Ship descriptive source grouping and filtering.
3. Add shared/different coverage synthesis and visible gaps.
4. Add the first official/primary-source connectors and promote their evidence in reader views.

### Release D — deeper personal utility and trust signals

1. Add source portfolios and breadth controls.
2. Add saves and read-later.
3. Add explicit attribution/provenance chains.
4. Add conservative corrections and uncertainty signals.
5. Add subject follows and in-app alerts.

## 7. Implementation guardrails

- Keep the no-full-article-body retention policy. Ground new features in retained RSS metadata, observations, permitted transient processing, linked primary sources, and explicit provenance.
- Do not turn publisher lean into a truth score or infer political identity from reading behavior.
- Evaluate model-generated classifications and comparisons with fixtures before using them broadly in reader-facing views.
- Expose reader capabilities through typed `/api/v1` contracts so the web, Expo client, and future delivery channels share one product boundary.
- Preserve current Story publication constraints unless a separate decision deliberately changes them; in particular, the current multi-newsroom threshold means exclusives do not yet become published Stories.
- Use reader-facing language, not internal pipeline terminology, outside the admin experience.
