# Sources and evaluation for US address parser correctness

Reviewed September 29, 2026. This review preserves the existing large MLS corpus and its historical results. It proposes a different measurement contract for future correctness claims.

The companion [implementation review](correctness-review-2026-09-29.md) records the target-gate change and the 2,000-input blind review queue prepared from the existing corpus. Those inputs remain unreviewed.

## Decision

Measure whether the parser faithfully interprets the **same text it receives**. Keep MLS → ATTOM agreement as a reference-comparison diagnostic. A property database can help resolve an address, but its fields are not automatically the correct token labels for another source's address string.

The current 93.427% development result is any-candidate agreement with ATTOM components on 268,923 admitted MLS inputs. It is not a measured parser-correctness percentage. The source mapping and live metadata investigation are recorded in [the preceding research report](research-95-2026-09-28.md). No public dataset examined here supplies independently adjudicated labels for these exact MLS strings.

Keep **one active corpus**, `.local/corpus/mls-valid.jsonl`, with its current 336,057 records, fixed split, and manifest. Add versioned annotations keyed to those records. Use external data for separately identified diagnostic fixtures and grammar research; do not combine their scores with the primary result.

## What the primary sources establish

| Source | Useful evidence | Limitation for our target | Recommended use |
| --- | --- | --- | --- |
| USPS Publication 28 | Delivery-line roles, abbreviations, secondary designators, regional number conventions | Postal output standards and reference matching do not label arbitrary MLS text | Annotation rules and conservative normalization fixtures |
| RESO Data Dictionary | Meaning of native MLS address fields, including unparsed strings and units | A schema does not guarantee that a feed's fields agree, nor that they were independently entered | Future same-listing provenance checks; never silently substitute ATTOM fields |
| usaddress / parserator | Token-labeled strings, building and subaddress examples, labeling tooling | Mixed provenance, some synthetic data, existing train/test overlap, different label granularity | Reviewable regression fixtures and annotation vocabulary |
| libpostal | Broad grammar coverage and reproducible generated training pipeline | Generated strings and synthetic subunits are not a blinded MLS gold set | Pattern discovery; clearly labeled synthetic robustness tests |
| OpenAddresses | Source-linked, structured address records with geographic coverage | Optional units, merged street fields, source transformations and differing licenses | Regional pattern discovery and carefully mapped fixtures |
| USDOT National Address Database | Authoritative address points, explicit subaddress structure and source metadata | Uneven completeness; address-point records are not raw-text annotations | Study building/unit hierarchy and geographic coverage gaps |

### USPS: distinguish parsing from postal validation

Publication 28 section 231 describes primary number, directional, street, suffix, and secondary components. It permits any parsing logic that produces the required decomposition. Section 211 separately describes matching postal output to current ZIP+4 and City State reference files. Implementing the decomposition or abbreviation rules alone therefore does not establish that an address exists or is deliverable. [USPS §231](https://pe.usps.com/text/pub28/28c2_012.htm), [USPS §211](https://pe.usps.com/text/pub28/28c2_001.htm).

The secondary-unit guidance permits secondary information above the delivery line when needed; a real parser cannot assume that every unit is the last token of one line. Appendix D1 also identifies regional hyphenated primary numbers and conditions removing a hyphen on reference evidence. Preserve an observed primary hyphen, directional, building, or unit unless the interpretation has a documented basis. This preservation rule is our engineering recommendation, not a claim that USPS defines every messy-input ambiguity. [USPS §213](https://pe.usps.com/text/pub28/28c2_003.htm), [USPS Appendix D1](https://pe.usps.com/text/pub28/28apd_002.htm).

### RESO: native MLS components are useful, but require provenance

RESO defines `UnparsedAddress` as a civic-address string that may also include locality, state, postal code, and country. Its property resource separately defines street direction, street name, suffix, number, and unit fields. `StreetNumber` can contain nonnumeric characters; `StreetNumberNumeric` retains only the integer portion. `UnitNumber` can represent a portion of a larger building or complex. A numeric-only house label is consequently inadequate for some inputs. [RESO UnparsedAddress](https://dd.reso.org/DD2.0/Property/UnparsedAddress/), [RESO Property fields](https://dd.reso.org/DD2.1/Property/).

If native MLS components become available later, check whether they were entered independently, reconstructed from the unparsed string, copied from a property reference, or truncated by an export. Retain their source and timestamp. They can propose labels; a conflict with visible text must trigger review. A field definition does not demonstrate annotation quality, and access to the dictionary does not confer rights to redistribute an MLS feed.

### usaddress / parserator: useful labels, with measurable caveats

usaddress explicitly separates parsing from address validity and normalization. Parserator provides manual token labeling tools; usaddress's labeling workflow initially proposes labels from its current model for a reviewer to correct. That is assisted annotation, not evidence of blind independent adjudication. The training guide distinguishes training examples from different instances reserved for testing. [usaddress](https://github.com/datamade/usaddress), [parserator](https://github.com/datamade/parserator), [usaddress training guide](https://github.com/datamade/usaddress/blob/aa7699b53a0843fc443f9e87285b88cbd9eaf50a/training/README.md).

A bounded download pinned to commit `aa7699b53a0843fc443f9e87285b88cbd9eaf50a` yielded the following local profile. Counts are our measurements of the named files, not published national coverage estimates. "Occupancy" means a row includes `OccupancyType` or `OccupancyIdentifier`. "Building/subaddress" means it includes `BuildingName`, `SubaddressType`, or `SubaddressIdentifier`.

| File | Rows | Unique strings after whitespace normalization | Rows with occupancy | Rows with building/subaddress |
| --- | ---: | ---: | ---: | ---: |
| `training/labeled.xml` | 1,513 | 1,488 | 417 | 171 |
| `measure_performance/test_data/labeled.xml` | 146 | 144 | 32 | 16 |
| `measure_performance/test_data/us50_test_tagged.xml` | 687 | 680 | 14 | 0 |
| `measure_performance/test_data/synthetic_clean_osm_data.xml` | 4,120 | 4,091 | 4 | 0 |
| `measure_performance/test_data/synthetic_osm_data.xml` | 4,122 | 4,087 | 0 | 0 |

The 144 unique strings in the small labeled test file include **8** also present in the downloaded training subset. The 680 unique US50 test strings include **123** such overlaps. The compared training subset was `labeled.xml`, `us50_messiest_manual_label.xml`, and `us50_train_tagged.xml`; this is not a full-repository overlap audit. It demonstrates why public filenames containing "test" cannot establish independence. [Pinned training directory](https://github.com/datamade/usaddress/tree/aa7699b53a0843fc443f9e87285b88cbd9eaf50a/training), [pinned test data](https://github.com/datamade/usaddress/tree/aa7699b53a0843fc443f9e87285b88cbd9eaf50a/measure_performance/test_data).

The XML labels also differ across files. For example, the US50 test file contains no `StreetNamePostType` tags, while the curated labeled test file does. A converter must distinguish a street phrase from a decomposed street name/suffix; mechanically mapping both to this library's `streetName` would create false failures. The repository's OSM conversion code explicitly assembles synthetic examples from component fields. [Conversion source](https://github.com/datamade/usaddress/blob/aa7699b53a0843fc443f9e87285b88cbd9eaf50a/parse_scripts/parse.py).

The repository has an MIT license, but its raw US50 files have a separate Sunita Sarawagi / IIT Bombay attribution and University of Illinois/NCSA terms. Keep the relevant notices with copied fixtures; do not flatten all upstream data provenance into "MIT." OSM-derived fixtures require their upstream provenance to be retained as well. [Repository license](https://github.com/datamade/usaddress/blob/aa7699b53a0843fc443f9e87285b88cbd9eaf50a/LICENSE), [raw-data license](https://github.com/datamade/usaddress/blob/aa7699b53a0843fc443f9e87285b88cbd9eaf50a/raw/LICENSE.md).

### libpostal: generated training is valuable, but answers another question

libpostal documents constructing tagged examples from OpenStreetMap and OpenAddresses using address-format templates, generating apartments/floors and PO boxes, and applying abbreviation and component-dropout transformations. It reports 99.45% complete-token parses on its held-out data. This is a result on its own task and distribution, not a comparable MLS accuracy claim. Its `road` label also combines distinctions this library exposes separately. [libpostal parser documentation](https://github.com/openvenues/libpostal#examples-of-parsing).

The published training bundles are large and have different source licenses: OSM-derived bundles are identified as ODbL, GeoPlanet as CC-BY, and OpenAddresses-derived data as carrying various licenses. The code's MIT license does not replace those data terms. No bulk libpostal download was needed for this review. Recommended use: inspect generation rules and adapt explicitly synthetic fixtures, keeping them outside the primary correctness numerator. [libpostal training data](https://github.com/openvenues/libpostal#training-data).

### OpenAddresses: inspect the original source, not just the CSV

OpenAddresses standardizes source fields and permits transformations that extract number, street, and unit from a combined string. A street can also be assembled from multiple original fields. Unit is optional. Thus a resulting component row may itself embody parsing decisions and cannot automatically adjudicate another parser. Prefer original jurisdiction fields plus source metadata where available. [OpenAddresses source/conform specification](https://github.com/openaddresses/openaddresses/blob/master/CONTRIBUTING.md).

The project describes its data as openly licensed, with attribution required by most sources. The source specification records per-source license URLs, attribution, share-alike terms, and whether those terms were inferred by a contributor. Preserve that provenance before importing fixtures. The advertised geographic breadth does not establish consistent unit coverage or independently labeled messy inputs. [OpenAddresses](https://openaddresses.io/), [license metadata specification](https://github.com/openaddresses/openaddresses/blob/master/CONTRIBUTING.md#optional-address-tags).

### National Address Database: strongest structural reference in this review

USDOT aggregates state, local, and tribal address data. The linked April 2023 schema represents address points and explicitly allows missing fields depending on the contributing source. It includes complete address numbers and a subaddress composed of building, floor, unit, room, seat, and additional location information; address classes include intersections, ranges, and unnumbered thoroughfares. This is useful evidence that "valid address" is broader than a numbered street with one final unit. [NAD overview](https://www.transportation.gov/gis/national-address-database), [NAD schema](https://www.transportation.gov/sites/dot.gov/files/2023-07/NAD_Schema_202304.pdf).

The current disclaimer calls the data open and a federal work without copyright protection, while separately noting state restrictions on mailing-list use. It also states that participating states may have incomplete coverage and does not guarantee accuracy or completeness. Record the actual release, source jurisdiction, and its metadata for any future download; this review did not fetch the nationwide dataset or assert complete US/subunit coverage. [USDOT NAD disclaimer, updated January 9, 2026](https://www.transportation.gov/mission/open/gis/national-address-database/national-address-database-nad-disclaimer).

## Recommended correctness contract

These are proposed project rules, rather than guarantees made by the sources above.

1. **Bind every label to the exact input.** Store corpus hash, stable row identity, input hash, annotation version, reviewer identity/type, and review status. Keep the original input immutable. Changes to normalization or labels create a new measurement version.
2. **Annotate source text before showing predictions.** The initial review view contains the input and annotation instructions, without ATTOM fields, current-parser output, failure status, or another parser's guess. Double-review a predeclared sample and adjudicate disagreements. Automated or LLM proposals remain provisional until reviewed; record who performed each stage.
3. **Preserve roles and complete structure.** Capture source spans, complete house identifier, directional roles, street/suffix, every secondary element in order, and locality when present. Do not score only the final unit while dropping its building or floor. Preserve distinctions between absent, unknown, and explicitly empty fields.
4. **Represent uncertainty honestly.** Distinguish a clear single interpretation, multiple text-supported interpretations, insufficient context, genuinely non-address text, and a valid address outside the parser's current scope. Ambiguity can have multiple accepted complete interpretations. A valid unsupported range or intersection remains a scope/coverage failure; it is not malformed merely because the current API cannot represent it.
5. **Separate candidate coverage from correctness.** Any accepted interpretation present is candidate recall. Report the share of emitted candidates supported by the reviewed interpretation set as a separate measure only when that set is complete. Also report exact-set agreement and candidate cost. Adding ten unsupported alternatives to recover one accepted reading must not automatically count as better correctness. Do not call the first unranked candidate a prediction.
6. **Keep every denominator visible.** Publish sampled, reviewed, adjudicated, resolvable, ambiguous, insufficient-context, excluded-nonaddress, and unsupported counts. Input invalidity and missing reference fields are different conditions. Lack of an ATTOM unit is not evidence that a listed unit is invalid. Unannotated records must not enter a correctness percentage.
7. **Freeze sampling before examining output.** Draw a probability sample from the active corpus for the headline estimate. Use state and challenge strata with documented selection probabilities; weight any estimate back to the declared corpus population. A separate targeted queue can accelerate debugging but is not an unbiased accuracy estimate. State plots need reviewed counts and uncertainty; a few examples cannot establish 95% state performance.
8. **Protect the evaluation split.** Keep development annotations available to the loop, and final annotations isolated from tuning. Check duplicates and shared property/address clusters across splits before making generalization claims. Existing holdout scores have already been observed; state that history rather than describing them as wholly untouched. Version and explicitly disclose any future split changes.

For a 95% goal, predeclare the success metric and uncertainty rule before running a release evaluation. If the product remains a candidate generator, its honest target is reviewed interpretation coverage with a strict unsupported-candidate guardrail. If it promises one answer, the target is exact full-structure accuracy for that answer, including secondary chains. These are different product contracts. Neither can currently be inferred from the 93.427% ATTOM agreement score.

## Immediate implementation order

First, make the harness identify cross-source agreement as diagnostic and parser correctness as unmeasured until eligible annotations exist. Preserve historical metrics and keep the existing corpus hash unchanged.

Next, produce a deterministic source-only annotation queue and a validated sidecar schema. Start with a modest pilot spanning all states and difficult structural forms to find annotation-rule defects. Use that pilot to estimate annotation effort and disagreement, then freeze the probability sample and protected evaluation procedure. Do not present a hand-selected pilot percentage as corpus-wide accuracy.

Finally, use reviewed development failures to improve parsing, and rerun both the correctness gate and the existing cross-source/performance diagnostics. An improvement that preserves visible identity while reducing ATTOM agreement may be correct; an agreement gain from deleting a visible unit may be wrong. The independent annotations make that distinction reviewable.

The present corpus was admitted partly using ATTOM-field consistency. Keeping it fixed avoids silently changing the benchmark, but its population is a **curated MLS cohort**, not every valid US address. If that selection bias is addressed later, create an explicit new corpus version and retain the old scores with their original population.

## Reproducibility and limits

The pinned usaddress files, original licenses, Git tree listing, SHA-256 file hashes, label frequencies, and overlap counts are under `.local/research-correctness-sources/`. The aggregate profile is `usaddress-profile.json`. Downloaded address records remain local; no external dataset was added to the active corpus or package.

This review inspected documentation, schema, conversion code, and a bounded labeled-data sample. It did not certify every upstream annotation, audit all source licenses, test current libpostal/usaddress models, measure national address coverage, establish deliverability, or produce a new parser-correctness percentage.
