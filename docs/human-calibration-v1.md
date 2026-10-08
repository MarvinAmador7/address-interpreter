# Human calibration protocol, version 1

This local workspace reviews the existing 200-case Luna pilot. It does not create another address corpus, change admission, or evaluate the holdout. Reviews are development evidence. A person's review does not automatically establish expert calibration or a public correctness score.

## Frozen selection

Select every disagreement between the two Luna passes, every case still unresolved or unsupported after agent adjudication, and 20 consensus cases selected by a fixed hash seed. Deduplicate that union, then mix it using a separate fixed seed. Record membership, reasons, input and proposal hashes before review begins. Selection reasons and proposals stay on the server until the reviewer saves an initial reading. The interface presents the frozen order in batches of 20. This is a targeted calibration sample, not a population accuracy estimate.

## Review

Enter a reviewer name and self-reported experience. Read the exact delivery line without parser predictions, reference fields, geocoding or agent proposals. Identify every meaningful piece of the source. The editor supports street addresses, optional locality, and ordered secondary elements. For an address form it cannot faithfully express, choose unsupported; do not call it invalid.

Select source tokens and assign them to the house number, street name, suffix, directions or secondary elements. Preserve hyphens, fractions, leading zeros, letter suffixes and meaningful punctuation. Building, floor and apartment are separate elements in source order. A bare unit has no observed designator. Formatting punctuation may be marked as a separator. No unexplained word or number may disappear.

Canonical values appear beside the selected source. The editor uppercases text, collapses whitespace, and suggests explicit suffix/directional/designator abbreviations. It does not invoke the parser. Check those values before saving. A value changed from that suggestion requires a note and remains an explicit human decision. The exact-set scoring contract keeps UNIT and APT distinct. Hypothetical spelling alternatives are not automatically accepted readings.

Choose one clear reading, multiple supported readings, unsure, unsupported, or clearly non-address. Multiple readings require separate complete assignments. Unsure and unsupported remain in the review population. When uncertain, a short explanation is more useful than a forced interpretation. Declare any prior exposure to proposed labels or parser output for this exact input.

Saving the initial reading permanently records it before the server reveals proposals. Compare your reading with the two Luna passes and the provisional agent decision. You may retain yours, load a proposal and edit it, or mark the case unresolved. Record why a final decision differs from the initial reading. Final revisions append new events and preserve the initial blind reading and previous decisions. Local drafts can be resumed; only explicit finalization counts as a completed human review.

## Evidence and scoring

The private journal is append-only with sequence numbers, hashes and durable writes. Stale edits are rejected. The workspace records source-token assignments, exact canonical components, reviewer identity and experience, exposure, initial decisions and final revisions. Export includes every selected input. Unfinished cases become unresolved annotations for scoring and remain visible in coverage.

The scorer evaluates complete candidate sets with pinned parser options and the existing benchmark contract. Review exports remain provisional, and scores are experimental development diagnostics. They do not open the 95% release gate. Independent expert review, guide revision where needed, a protected evaluation and a declared sampling/uncertainty rule still precede a public correctness claim. Human reviews here do not rewrite the original Luna pilot's historical counters.
