# Fixtures

Captured from live publisher feeds on **2026-10-10** (around 12:00 UTC). Items are real; each file is trimmed to a handful of items with metadata only (`title`, `link`, `guid`, `pubDate`, `description`). HTML is stripped from descriptions, and no `content:encoded` or article body is included. Atom (The Verge) and RDF (DW) feeds were converted to RSS 2.0. Channel title/link are the originals.

- `publishers.json`: 12 seed publishers with feed URL and `articleBodyProcessingPolicy`. This is a best-effort robots.txt/terms/paywall check, **not** legal review. All are `metadata_only`.
- `rss/<slug>.xml`: poll 1 (34 items across 12 publishers).
- `rss-update/<slug>.xml`: simulated poll 2 for `bbc`, `guardian`, `aljazeera`.

## Intentional event groups (poll 1)

**A. Trump–Putin deal to release Russian diesel (Oct 9)**
- washingtonpost: Trump announces diesel deal with Russia in bid to lower prices
- npr: Trump says U.S. to get diesel from Russia, relaxing pressure on Moscow to ease prices before midterms
- bbc: Trump announces deal for Russian diesel as Zelensky calls it a gift to Putin
- guardian: Zelenskyy furious as Trump announces deal to buy Russian diesel
- dw: Trump, Putin agree on deal to release Russian diesel to US, world markets
- france24: Trump strikes diesel deal with Putin, reversing years of pressure on Russia over Ukraine war
- euronews: Zelenskyy hits out at 'gifts to Putin' after Trump announces deal for Russian diesel

**A2. Follow-up development of A (same Russia/Ukraine topic, distinct Story)**
- aljazeera: Hours after Trump-Putin diesel deal, Ukraine strikes Russian fuel site

**B. Navi Pillay awarded the Nobel Peace Prize (Oct 9)**
- nytimes: Navi Pillay, South African Jurist, Is Awarded the Nobel Peace Prize
- washingtonpost: Navi Pillay, leading human rights jurist, awarded Nobel Peace Prize
- guardian: ICJ judge Navi Pillay wins Nobel peace prize for promoting international law
- france24: South African judge awarded Nobel Peace Prize

**B2. Follow-up of B: Trump attacks Norway over the Nobel snub (Oct 10)**
- bbc: 'Stain on the country': Trump criticises Norway over Nobel Peace Prize
- guardian: Trump fumes over Nobel peace prize snub and criticizes Norway
- aljazeera: Trump slams Norway for not awarding him Nobel Peace Prize
- euronews: 'No one ever heard of her': Trump goes off on petty rant after Nobel Peace Prize snub

**B3. Related branch of B: US sanctions the International Criminal Court (Oct 9)**
- washingtonpost: Trump hits International Criminal Court with sanctions after Nobel goes to former judge
- bbc: US unveils sanctions on ICC in move court condemns as 'assault on rule of law'
- dw: US imposes sanctions aiming to 'dismantle' International Criminal Court

B, B2 and B3 are meant to form one branching narrative: B → B2 (reaction) and B → B3 (related development). They should stay separate Stories.

**C. Magnitude 7.7 earthquake in Panama (Oct 9)**
- nytimes: 7.7-Magnitude Panama Earthquake Sets Off Series of Aftershocks
- bbc: Powerful magnitude 7.7 earthquake hits Panama, damaging buildings
- guardian: Powerful 7.7-magnitude earthquake strikes Panama and triggers panic in capital
- euronews: Powerful 7.7-magnitude earthquake strikes Panama, damaging buildings and injuring at least 27

**Unrelated single-source items**
- nytimes: Quebec Independence Is Unlikely, but Some Will Still Dream
- politico: House Republicans are bracing for catastrophe in once safe red seats
- politico: Kansas enters the chat as Senate map tilts further into red territory
- npr: Ongoing lawsuits allege GLP-1s can cause serious harm. But we don't know how often
- 404media: Scientists Detect Record-Breaking Radio Signal from the Ancient Universe
- 404media: Following 404 Media Investigation, Senator Demands Info About White House's License Plate Surveillance Program
- theverge: Decade-old RAM is making a comeback
- theverge: Google teases Fitbit Edge launch next week
- dw: China, EU reach deal to 'moderate' China's car exports to EU
- france24: 'All human emotions': French astronaut Sophie Adenot returns to Earth
- aljazeera: Chile declares Las Condes disaster zone after mudslide

## rss-update variations (poll 2)

Each update file contains every poll-1 item plus the following changes:

| slug | (a) headline revision (same guid/link, **title edited by hand, not real**) | (b) new real item | (c) tracking-param duplicate (same guid, `utm_source=rss&utm_medium=feed` appended to link; appears alongside the original) |
|---|---|---|---|
| bbc | "Powerful magnitude 7.7 earthquake hits Panama, damaging buildings" → "Powerful 7.7 magnitude earthquake strikes Panama, damaging buildings" | Analysis: Trump's shock Russia deal highlights mounting pressure to curb fuel prices (group A) | Trump announces deal for Russian diesel… |
| guardian | "Trump fumes over Nobel peace prize snub and criticizes Norway" → "…and lashes out at Norway" | Hurricane Isaias makes landfall in Florida and hammers Gulf coast (unrelated) | ICJ judge Navi Pillay wins Nobel peace prize… |
| aljazeera | "Hours after Trump-Putin diesel deal, Ukraine strikes Russian fuel site" → "Ukraine strikes Russian fuel site hours after Trump-Putin diesel deal" | Russia kills 15 in Ukraine as US hosts 'productive' talks to end war (related to the A/A2 topic) | Chile declares Las Condes disaster zone… (its link already had `?traffic_source=rss`) |

The "new" items are real items from the same live feed capture. They were left out of poll 1 on purpose.
