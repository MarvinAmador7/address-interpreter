# US property address resolution: competitive strategy

Strategy discussion recorded September 28, 2026.

The initial objective is to make Melissa unnecessary for US real-estate address workflows. Winning that market is a concrete objective. Putting the entire company out of business is not something we can promise.

The proposed product promise:

> Turn messy property addresses into the correct building, unit, and property record, with evidence explaining every match.

## 1. Make the library the easiest entry point

Keep the parser free, local, fast, and predictable. Preserve original text, building/unit chains, and alternative interpretations. Ship excellent TypeScript support, examples, and stable releases.

The cloud service should accept its output directly. Developers should be able to start locally and add reference-backed resolution without replacing their integration.

At the time of this discussion, the research loop reported **93.37% candidate agreement on curated development data**. That is useful progress, but commercial proof requires correctly choosing an actual property from those candidates. This figure is neither a property-resolution precision measurement nor a claim of held-out performance.

## 2. Build the reference data operation before expanding the API

Assemble permitted sources for postal addresses, local address points, parcels, buildings, units, aliases, and changes over time. Verify that HomeAnalytics source agreements permit the intended commercial use.

The National Address Database is one source to evaluate. USDOT compiles it from state, local, and tribal address programs. It should be one input to the reference system. [USDOT National Address Database](https://www.transportation.gov/gis/national-address-database)

Every assertion needs its source, observation date, and confidence. Conflicting sources must remain distinguishable.

The hardest asset to build will be accurate unit relationships and their maintenance.

## 3. Model property identity correctly

Store addresses, parcels, buildings, units, and postal delivery points as separate entities with explicit relationships. A condominium, apartment complex, and rural parcel will not fit the same simple hierarchy.

The service should return:

| Result | Meaning |
| --- | --- |
| Exact unit match | Evidence supports this specific unit |
| Building match | Building identified; unit unresolved |
| Ambiguous | Multiple plausible entities remain |
| Not found | Reference coverage is insufficient |
| Invalid input | The input cannot support address resolution |

Return postal deliverability separately. A property match and a deliverable mailing address answer different questions.

Melissa already has persistent address IDs, building-level BaseMAK identifiers, and property lookup. Those capabilities are existing competition; we must demonstrate better results on our chosen workloads. [Melissa property documentation](https://docs.melissa.com/cloud-api/property/property-reference-guide.html)

## 4. Win on difficult cases with fewer wrong matches

Prioritize MLS imports, apartment portfolios, condominium units, rural routes, new construction, historical aliases, and conflicting listing fields.

Proposed commercial acceptance gates:

- At least **99.9% precision among automatically accepted property/unit matches**, supported by an adequately sized independent review.
- Higher verified coverage than Melissa at that same precision threshold.
- Separate reporting for buildings, units, states, and difficult formats.
- Measured latency, reference freshness, and cost per correct resolution.

These are targets, not achieved results.

Keep the curated corpus for parser regression testing. Evaluate commercial performance on customer traffic as well, where incomplete inputs and uncertainty still require useful responses.

## 5. Use postal certification as an integration path

For customers needing postal validation, start with a licensed certified component while building the property-resolution service. Pursue our own certification when demand and economics justify it.

USPS CASS evaluates address-matching software. Our current parser benchmark does not replace that process. [USPS CASS](https://postalpro.usps.com/certifications/cass)

## 6. Sell measurable replacement projects

Recruit three to five design partners already spending money on address cleanup or property matching. Run beside their current provider, review disagreements, and quantify:

- Additional properties correctly linked.
- Wrong unit merges avoided.
- Manual review hours eliminated.
- Total processing cost.

Provide batch processing, a simple API, migration tooling, and a reproducible comparison report.

Price against customer value and data costs. At the time of this discussion, Melissa advertised US verification subscriptions starting at **$5,145 for one million records annually**. Inexpensive requests alone will be a weak advantage. Verify current terms before using this figure in a commercial comparison. [Melissa pricing](https://www.melissa.com/pricing)

## 7. Turn corrections into a durable advantage

With appropriate customer permissions, adjudicated failures should produce reference corrections, parser tests, and better matching rules. Track which changes improve coverage without increasing false matches.

Exportable IDs and versioned results will help customers trust the system.

## First 90 days

This is a proposed validation plan, contingent on usable data access and design-partner participation.

| Period | Required outcome |
| --- | --- |
| Days 1–30 | Secure usable data rights, recruit design partners, define independent matching benchmarks |
| Days 31–60 | Deliver cloud resolution for selected markets with building/unit evidence and explicit uncertainty |
| Days 61–90 | Run paid pilots, publish reproducible comparisons where permitted, demonstrate positive unit economics |

The first decisive milestone is a customer choosing us because we correctly resolve materially more of their difficult property addresses, with equally low or lower error rates.

The parser provides a useful foundation. Reliable reference data, measured matching quality, and customers willing to switch will determine whether this becomes a serious Melissa competitor.
