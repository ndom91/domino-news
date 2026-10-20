# Third-party data licensing register

Last reviewed: 2026-10-20. This is an operational register, not legal advice. It records the
sources Domino Wire uses or has considered for publisher assessments, and the review required
before a commercial launch.

## Current approach

Lean evidence is hand-checked and stored as a small, attributed finding for a named publisher;
Domino does not scrape, mirror, or redistribute a ratings database. It uses only AllSides,
Reuters Institute Digital News Report (DNR), and documented Domino estimates. See
[`prompts/lean-estimate.md`](prompts/lean-estimate.md) for the evidence threshold.

Every new source must be reviewed for methodology, licence, attribution requirements, automated
access terms, update rights, and the right to display a rating to readers.

## Sources in use

| Source | Current use | Current position | Commercial-launch action |
| --- | --- | --- | --- |
| [AllSides](https://www.allsides.com/) | US publisher lean ratings | Its ratings are CC BY-NC 4.0; Domino displays the required attribution. Entries are hand-checked because AllSides blocks automated access and supplies bulk data on request. | **Do not rely on CC BY-NC for commercial use.** Obtain a commercial licence or replace the source; confirm whether individual ratings and historical ratings are included. |
| [Reuters Institute DNR](https://reutersinstitute.politics.ox.ac.uk/digital-news-report) | Country-relative audience-lean scores | Scores are read by hand from the published charts; no licence statement is attached to the chart data. | Ask the Reuters Institute for permission or a data licence covering storage and reader-facing display of individual outlet scores. |
| [Wikidata](https://www.wikidata.org/wiki/Wikidata:Copyright) | Publisher ownership evidence | CC0 data; imported ownership facts are reviewed before publication. | Re-check attribution/provenance practice, but no commercial data licence is expected. |
| [Wikipedia perennial sources](https://en.wikipedia.org/wiki/Wikipedia:Reliable_sources/Perennial_sources) | Reliability evidence | Wikipedia text and database content are CC BY-SA. Domino stores a short attributed assessment finding, not a copy of the list. | Review whether the displayed/derived use triggers CC BY-SA obligations; retain attribution and source links. |

## Sources explicitly not used without a licence

| Source | Why it is excluded | What would be required to reconsider |
| --- | --- | --- |
| [Media Bias/Fact Check](https://mediabiasfactcheck.com/mbfcs-data-api/) (MBFC) | Site terms prohibit reproduction and redistribution without permission. Its public API page directs commercial, platform, dashboard, AI, and client-facing uses to a direct commercial API licence. | Written licence or direct API agreement that permits storing the relevant fields and displaying attributed ratings in Domino. |
| [Ad Fontes Media](https://adfontesmedia.com/) | Its outlet ratings are a paid/licensed product. | Licence covering the planned publisher set, updates, storage, and reader-facing display. |
| [NewsGuard](https://www.newsguardtech.com/) | Its ratings are a paid/licensed product. | Licence covering the planned publisher set, updates, storage, and reader-facing display. |
| [Ground News](https://ground.news/app/rating-system) | Its scores are derived averages of AllSides, Ad Fontes, and MBFC ratings. Its terms prohibit copying/storing content, automated access, and building a competing service without permission. | A written Ground News data licence **and** confirmation that its upstream licences permit Domino’s intended use. Prefer licensing original sources instead. |

## Before enabling a new ratings provider

1. Record the provider, exact URL, access route, evidence date, methodology, and country/market
   scope.
2. Obtain written permission when the terms do not expressly allow Domino’s storage and public
   display of the rating.
3. Add required attribution in `EVIDENCE_ATTRIBUTION` and test that it appears wherever relevant
   evidence is shown.
4. Document the provider’s correction/update process and schedule a periodic re-check.
5. Do not use a provider’s rating to infer a global score when its methodology is limited to a
   different political market.
