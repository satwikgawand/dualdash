# Speed limits: OSM and commercial options for DualDash

**Executive summary.** OSM speed limits are usable but uneven: a live Overpass sample on 2026-10-25 found `maxspeed` on 97.2% of major road ways in central London, 99.5% in Seattle, 85.1% in Manhattan/Brooklyn, and 0.8% in suburban Mumbai — coverage is a per-region lottery. The public Overpass API explicitly warns against "setting up an app for more than just OSM mappers and relying on the public instances as backend"; the stated guideline is ~10,000 requests/day and <1 GB/day, with an automatic quota system and HTTP 429 on rejection. So OSM must be a **one-time regional tile pull**, never a per-drive query, and the derived dataset must carry ODbL attribution and be shared alike. Commercial feeds are expensive and explicitly unreliable: Google's Roads API Speed Limits SKU is $20.00 per 1,000 events after a 5,000 free tier, is marked "limited access", requires an Asset Tracking licence, and Google states its speed limit accuracy "cannot be guaranteed... may be estimated, inaccurate, incomplete, or outdated"; HERE's free plan caps at 1,000 requests/day and excludes "Asset Management" use cases entirely. **Verdict for v1: ship no speed limits.** Build the HUD first; revisit OSM offline tiles as a v1.5 feature with a per-region data budget and a drive-test accuracy gate.

## 1. What OSM actually stores

Speed limits are tagged on ways with `maxspeed=*`; the value is numeric, unitless for km/h, suffixed ` mph` or ` knots` otherwise (e.g. `maxspeed=30 mph`, `maxspeed=50`). Related tags: `maxspeed:conditional`, `maxspeed:advisory`, `maxspeed:hgv`, `maxspeed:forward`. — https://wiki.openstreetmap.org/wiki/Speed_limits

Implication for the app: the raw tag is not a single canonical unit. The app must normalise to the driver's chosen unit and must handle conditional/advisory tags explicitly rather than parsing the base value blindly.

## 2. Overpass API: usage, quotas, and what is allowed

### 2.1 Stated limits

From the Overpass API manual (Commons page):

- "As a broad guideline to stay within safety margins, users are expected to send a maximum of about **10000 requests per day** and keep their download volume below about **1 GB per day**."
- "Each of the Overpass API servers can fulfill about **1 million requests per day**, and two servers listen on the address overpass-api.de."
- "Requests are assigned by taking the IP address as the user."
- Requests denied by the rate limit return **HTTP 429**.
- Requests stay enqueued up to **15 seconds** before being discarded.

— https://dev.overpass-api.de/overpass-doc/en/preface/commons.html

The wiki's instance table confirms the main instance is operated by FOSSGIS and documents usage policy per instance: https://wiki.openstreetmap.org/wiki/Overpass_API

### 2.2 Explicitly named bad behaviour

The same page lists, verbatim: "Setting up an app for more than just OSM mappers and relying on the public instances as backend" as problematic — and for that case: "**only running your own instance sustainably serves your mission**". Also flagged: stitching bounding boxes to scrape the world, and asking for individual elements one by one millions of times (use a planet dump instead). — https://dev.overpass-api.de/overpass-doc/en/preface/commons.html

**Consequence for DualDash:** a phone app that queries Overpass per drive, per zoom level, or per road segment is exactly the pattern the project tells you not to run. Community reports of restrictive limits are consistent with this: https://help.openstreetmap.org/questions/52384/very-restrictive-usage-limit-on-the-overpass-api-since-a-while/

## 3. Offline caching strategy (the only viable OSM approach)

Design: **pull tiles once, ship them, never query from the car.**

1. **Choose regions, not the world.** A country/state extract (e.g. Geofabrik-style regional PBFs) filtered to road ways with `maxspeed`. Planet-scale extraction contradicts the Overpass guidance above; planet dumps are the sanctioned alternative to scraping: https://dev.overpass-api.de/overpass-doc/en/preface/commons.html
2. **Filter to driving roads only** (`motorway`, `trunk`, `primary`, `secondary`, `tertiary`, `residential`, `unclassified`, plus link variants). This shrinks the extract by an order of magnitude versus full OSM.
3. **Normalise at build time**, not at runtime: parse `maxspeed`, `maxspeed:conditional`, `maxspeed:advisory`; convert to a single integer in the driver's unit; record the source and any conditionality in the row.
4. **Store locally first** (SQLite / device-side Turso sync), keyed by road way-id or a spatial index, so the HUD reads offline in a tunnel.
5. **Version and refresh quarterly at most.** Speed limits change slowly; a stale limit is a wrong limit, so record `data_version` and show it in an About screen (also an ODbL-friendly place for attribution).

**Measured size signal (2026-10-25):** a single Overpass query for major-road ways with tags in a ~0.03°×0.05° central-London box returned 5,093 ways in a 2 MB JSON response. Extrapolation: a filtered city-sized region is single-digit MB; a whole country is a real download decision (ASSUMPTION: exact country sizes not measured here — needs a build-time measurement before shipping).

## 4. Coverage: what a live sample shows

Overpass queries run 2026-10-25 against `overpass-api.de`, selecting `highway` in {motorway, trunk, primary, secondary, tertiary, residential, unclassified} inside each bounding box, counting ways with a `maxspeed` tag:

| Region (bbox) | Road ways returned | With `maxspeed` | Coverage |
| --- | --- | --- | --- |
| Central London (51.50,-0.15 → 51.53,-0.10) | 5,093 | 4,948 | **97.2%** |
| Seattle (47.60,-122.36 → 47.66,-122.28) | 5,313 | 5,287 | **99.5%** |
| Manhattan/Brooklyn (40.70,-74.02 → 40.76,-73.95) | 5,508 | 4,685 | **85.1%** |
| Suburban Mumbai (19.07,72.85 → 19.12,72.92) | 4,861 | 40 | **0.8%** |

Method note: these are *presence* of the tag, not correctness of the value. `source:maxspeed` was present on 6/5,508 NYC ways and 0 in the other samples, so provenance metadata is essentially absent — you are trusting the crowd. Local measurement, 2026-10-25.

**Reading:** US/UK urban coverage is strong; India is effectively uncovered. Independent literature agrees that attribute completeness and accuracy are the open quality problem for OSM road data, especially outside geometry: https://doi.org/10.5194/ica-abs-10-297-2025 , https://media.ccc.de/v/state-of-the-map-2024-academic-track-50972-assessing-the-attribute-accuracy-and-logical-consistency-of-road-data-in-openstreetmap

Default-limit inference is a known gap: a State of the Map talk documents that `source:maxspeed` "is only good to determine if it is signed, urban or rural" and that defaults must be inferred where no explicit `maxspeed` exists: https://2022.stateofthemap.org/attachments/YWH3XD_Inferring_Default_Speed_Limits_-_Tobias_Zwick_3YzEqob.pdf

**Product consequence:** in low-coverage regions the app must show "speed limit unknown", never a guessed value.

## 5. ODbL obligations

- OSM data is licensed under the **Open Database License (ODbL)** by the OSM Foundation. "You are free to copy, distribute, transmit and adapt our data, as long as you credit OpenStreetMap and its contributors. If you alter or build upon our data, you may distribute the result only under the same license." — https://www.openstreetmap.org/copyright
- Required actions where you use the data: (1) provide credit to OpenStreetMap by displaying the attribution notice; (2) make clear the data is under ODbL. — https://www.openstreetmap.org/copyright
- The OSMF attribution guideline (board-adopted 2021-06-25) is the safe harbour: attribution "must be presented to anyone who uses, views, accesses, interacts with, or is otherwise exposed to" the work, must not require interaction to see, and must sit in the vicinity of the produced work. For a **database** you ship: "You must include attribution to OpenStreetMap and either the text of the ODbL or a link to it as part of the database... in a location (such as a relevant directory) where users would be likely to look for it, such as a readme file, or within the data or metadata." — https://osmfoundation.org/wiki/Licence/Attribution_Guidelines
- Full licence text: https://opendatacommons.org/licenses/odbl/

**Practical obligations for DualDash:**

1. Persist `© OpenStreetMap contributors` **in the shipped dataset/metadata**, not only in an About screen.
2. Surface the ODbL link in-app (About → Data licences), reachable without tapping through the HUD.
3. Treat the derived speed-limit table as a **derivative database**: same ODbL, share-alike applies if Distributed. Read the legal text before ship — the guideline says the legal text takes precedence. ASSUMPTION: not legal advice; flag for review.

## 6. Commercial alternatives

### 6.1 Google Roads API — Speed Limits

- Endpoint: `https://roads.googleapis.com/v1/speedLimits`. Request by `path` (up to 100 lat/lng pairs, snapped to road) or `placeId`. Response includes the limit, units (KPH/MPH), and possibly snapped points. — https://developers.google.com/maps/documentation/roads/speed-limits
- **Accuracy disclaimer, verbatim:** "The accuracy of speed limit data returned by the Roads API cannot be guaranteed. The speed limit data provided is not real-time, and may be estimated, inaccurate, incomplete, or outdated." For variable limits, the maximum for automobiles on the segment is returned. — https://developers.google.com/maps/documentation/roads/speed-limits
- **Licence gate:** "The Speed Limit service is available to all customers with an Asset Tracking license." — https://developers.google.com/maps/documentation/roads/speed-limits
- **Price (Google Maps pricing list, fetched 2026-10-25):** SKU `Roads - Speed Limits` (BC44-A4CC-322A), Pro tier, **free usage cap 5,000 events**, then **$20.00 per 1,000 events** at the 100,000/month band, $16.00 next band, $12.00 beyond. Costs are listed per 1,000 events. — https://developers.google.com/maps/billing-and-pricing/pricing
- **Billing unit:** "the usage limit is based on number of requests for the Speed Limits endpoint as well, even though billing is based on the number of elements." — https://developers.google.com/maps/documentation/roads/usage-and-billing
- **Rate limits:** no daily maximum, but 30,000 requests/minute across Roads endpoints and 100 points per request; billing requires enabled billing and an API key. — https://developers.google.com/maps/documentation/roads/usage-and-billing
- Google's own advice is to "sample asset locations at intervals and batch speed limit requests" — i.e. they expect server-side batching, not per-fix phone calls. — https://developers.google.com/maps/documentation/roads/speed-limits

**Cost read:** even a modest fleet of drivers doing one batched call per minute of driving blows past the 5,000 free events within a single day of use, at $20/1,000 thereafter. For a free/ad-free consumer app this is not viable at the margin.

### 6.2 HERE

- Free **Limited Plan**: "a limit of **1,000 daily Requests**" plus per-service RPS caps (Map Attributes 10 RPS, Routing 10 RPS, etc.). — https://www.here.com/get-started/pricing/rps-limits-excluded-use-cases
- **Use-case exclusion:** "Asset Management" — defined as locating, tracking and/or displaying on a map, route calculation, deriving analytics, and driver hazard alerts — is **excluded from the Limited and Base Plans**; those customers must contact HERE. — https://www.here.com/get-started/pricing/rps-limits-excluded-use-cases
- Paid tiers are "pay-as-you-grow" with volume discounts; no public per-request speed-limit price is published on the pricing page (it is contact-sales). — https://www.here.com/get-started/pricing
- HERE publishes its own accuracy bar for ISA data: the EU ISA regulation "mandates a minimum of 80% accuracy for each road type... with the overall system performance needing to be correct 90% of the time." — https://www.here.com/developer/blog/isa-data-capture-accuracy-and-processing-how-speed-limit-data-gets-into-automobiles

**Cost read:** the free tier is 1,000 requests/day total and the relevant use case may be contractually excluded. Not viable for v1 without a sales conversation and a budget.

### 6.3 Comparison

| Option | Direct money cost | Data quality | Offline | Fit for DualDash v1 |
| --- | --- | --- | --- | --- |
| OSM via public Overpass, live | Free but **policy-violating** if used as an app backend | 0.8%–99.5% coverage by region; value correctness unverified | No | **No** — forbidden pattern |
| OSM via one-time regional extract | Free (build/CI time + storage) | Same coverage lottery; build-time normalisation | Yes | **Yes, v1.5** — subject to accuracy gate |
| Google Roads Speed Limits | $20/1,000 events after 5,000 free; Asset Tracking licence | Google disclaims accuracy and real-time | No | **No** |
| HERE | 1,000 req/day free; "Asset Management" excluded from free/base | Vendor-maintained; ISA-grade targets | Via SDK, paid | **No** for v1 |

## 7. Verdict for v1

**NO-GO on shipping speed limits in v1. GO-WITH-CONDITIONS for OSM offline tiles in v1.5.**

Reasons:

1. **Product:** v1 scope is speed, heading, location, trips (`SPEC.md`). Speed limits are a warning feature with legal/UX risk (a wrong limit invites a wrong alert); the data shows coverage varies from 99.5% to 0.8% by region with no per-value provenance.
2. **Technical:** offline normalised tiles are straightforward (section 3) and fit the HUD's offline requirement; live Overpass from the car is explicitly disallowed by the Overpass project.
3. **Cost:** Google is ~$20/1,000 events with a disclaimer attached; HERE free tier is 1,000 requests/day and excludes this use case. Neither is a consumer-app margin.
4. **Maintenance:** a quarterly regional refresh pipeline is a real, if modest, ongoing job — the kind of thing `stack.md` should keep out of the critical path for a first release.

**Conditions for reopening:**

- C1: Product confirms speed limits are a differentiator worth the work (open question O1 in `SPEC.md`).
- C2: Build-time measurement of target-region extract size and coverage; ship only regions above an agreed coverage floor (ASSUMPTION: floor to be set, candidate 90%).
- C3: Drive-test the normalised values against ground truth in two cities; record disagreement before any in-app display.
- C4: Legal review of ODbL share-alike on the derived database.

## 8. Open questions

- O1: Which launch regions? Coverage differs wildly (section 4).
- O2: Do we infer default limits (urban/rural) where `maxspeed` is absent, per the Zwick method, or show "unknown"?
- O3: Is a "speed limit exceeded" alert in scope at all, or is a passive limit readout enough? Alerts change the app's liability profile.
- O4: Quarterly refresh — who runs it, and where does the CI live?
