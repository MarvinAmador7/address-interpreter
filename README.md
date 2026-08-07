# `@marvin-amador-7/address-interpreter`

[![npm version](https://img.shields.io/npm/v/%40marvin-amador-7%2Faddress-interpreter.svg)](https://www.npmjs.com/package/@marvin-amador-7/address-interpreter)
[![CI](https://github.com/MarvinAmador7/address-interpreter/actions/workflows/ci.yml/badge.svg)](https://github.com/MarvinAmador7/address-interpreter/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/npm/l/%40marvin-amador-7%2Faddress-interpreter.svg)](./LICENSE)
[![Node.js 18+](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](./package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-types_included-3178C6?logo=typescript&logoColor=white)](./src/index.ts)

**Ambiguity-preserving US address interpretation for systems where a wrong match is worse than no match.**

A parser can tell you what an address string _could_ mean. Only your property index, customer database, or authoritative address source can tell you which meaning actually exists.

This package keeps those two jobs separate:

- `interpretAddress(input)` is a pure function that tokenizes a delivery line, normalizes recognized components, and returns every supported interpretation.
- `createAddressResolver(index)` asks your data adapter to look up those candidates, then returns an explicit `resolved`, `ambiguous`, `not-found`, or `invalid` result.

```text
raw delivery line
       │
       ▼
lossless tokens + source spans
       │
       ▼
one or more address candidates
       │
       ▼
your AddressIndex adapter ──► database / search index / vendor
       │
       ▼
resolved | ambiguous | not-found | invalid
```

The module has no runtime dependencies, performs no I/O, and ships ESM, CommonJS, and TypeScript declarations.

## Why this exists

Consider this production-shaped input:

```text
3637 Snell Ave 231
```

It has at least two valid structural readings:

1. House `3637`, street `SNELL AVE`, secondary unit `231`.
2. House `3637`, literal street name `SNELL AVE 231`, no secondary unit.

The strings are structurally indistinguishable. A larger denylist, a greedier regular expression, or a route-name heuristic can only move the error somewhere else.

That matters because a confident parser can turn an address miss into a query for the wrong property. In property, identity, billing, and compliance systems, an explicit ambiguous result is often safer than silently returning another entity.

`@marvin-amador-7/address-interpreter` therefore follows one rule:

> Preserve plausible meanings during interpretation. Resolve them only with evidence from real data.

## Installation

```sh
npm install @marvin-amador-7/address-interpreter
```

```sh
yarn add @marvin-amador-7/address-interpreter
```

Node.js 18 or newer is required.

## Quick start

```ts
import { interpretAddress } from "@marvin-amador-7/address-interpreter";

const interpretation = interpretAddress({
  deliveryLine: "3637 Snell Ave 231",
  city: "San Jose",
  state: "CA",
  postalCode: "95136",
});

console.log(interpretation.candidates);
```

The two candidates are:

```ts
[
  {
    id: "trailing-token-as-unit",
    assumptions: ["trailing-token-is-unit"],
    sourceSpans: {
      houseNumber: { start: 0, end: 4 },
      street: { start: 5, end: 14 },
      secondary: { start: 15, end: 18 },
    },
    components: {
      houseNumber: "3637",
      streetName: "SNELL",
      streetSuffix: "AVE",
      secondary: { number: "231" },
      city: "SAN JOSE",
      state: "CA",
      postalCode: "95136",
    },
  },
  {
    id: "trailing-token-as-street",
    assumptions: ["trailing-token-is-street"],
    sourceSpans: {
      houseNumber: { start: 0, end: 4 },
      street: { start: 5, end: 18 },
    },
    components: {
      houseNumber: "3637",
      streetName: "SNELL AVE 231",
      city: "SAN JOSE",
      state: "CA",
      postalCode: "95136",
    },
  },
];
```

Use `candidate.id` to identify a candidate. Do not depend on array position as a business rule.

## Lossless tokens and source spans

Normalization should not destroy the evidence that produced it. Every interpretation includes the original delivery-line tokens:

```ts
const result = interpretAddress({
  deliveryLine: "123-45 O'Connor Ave #231",
});

result.tokens;
// [
//   { raw: "123-45",  normalized: "123-45",  start: 0,  end: 6  },
//   { raw: "O'Connor", normalized: "O'CONNOR", start: 7,  end: 15 },
//   { raw: "Ave",     normalized: "AVE",     start: 16, end: 19 },
//   { raw: "#",       normalized: "#",       start: 20, end: 21 },
//   { raw: "231",     normalized: "231",     start: 21, end: 24 },
// ]
```

Source spans are zero-based, end-exclusive JavaScript string offsets into `deliveryLine`. They make it possible to:

- highlight the exact text behind a candidate;
- audit normalization decisions;
- attach confidence or provenance outside this module;
- build correction interfaces without reconstructing the original input.

## Explicit secondary units

An explicit designator produces one candidate because the string itself carries the evidence:

```ts
interpretAddress({
  deliveryLine: "100 O'Connor Ave. Apt. 4",
  city: "San Jose",
  state: "CA",
}).candidates[0].components;

// {
//   houseNumber: "100",
//   streetName: "O'CONNOR",
//   streetSuffix: "AVE",
//   secondary: { designator: "APT", number: "4" },
//   city: "SAN JOSE",
//   state: "CA",
//   postalCode: undefined,
// }
```

Multi-token explicit unit numbers are preserved:

```text
123 Main St Apt 231 B
                    └── secondary: { designator: "APT", number: "231 B" }
```

Approved numberless forms such as `BASEMENT`, `FRONT`, `LOBBY`, `LOWER`, `OFFICE`, `PENTHOUSE`, `REAR`, `SIDE`, and `UPPER` are also recognized.

## Bare trailing unit-shaped tokens

A bare trailing token becomes ambiguous only when all of the following are true:

- the delivery line contains at least four tokens;
- a recognized street suffix precedes the trailing token, with an optional post-directional between them;
- the trailing token contains at least one digit;
- the trailing token contains only letters, digits, and internal hyphens.

Supported shapes include:

```text
231
231-B
B231
231-233
```

The interpreter does **not** choose the unit meaning. It returns the unit and literal-street candidates together.

That same rule intentionally applies to route-shaped strings:

| Delivery line           | Candidate 1             | Candidate 2                 |
| ----------------------- | ----------------------- | --------------------------- |
| `123 Abbey Road 4`      | `ABBEY RD`, unit `4`    | literal `ABBEY ROAD 4`      |
| `123 State Spur 5`      | `STATE SPUR`, unit `5`  | literal `STATE SPUR 5`      |
| `100 State Turnpike 12` | `STATE TPKE`, unit `12` | literal `STATE TURNPIKE 12` |
| `123 Old Highway 12`    | `OLD HWY`, unit `12`    | literal `OLD HIGHWAY 12`    |
| `123 PR Carr 2`         | `PR CARR`, unit `2`     | literal `PR CARR 2`         |

No finite route-designator denylist can prove which row exists in your data. That is the resolver's job.

## Resolve candidates with real data

Implement the small `AddressIndex<T>` interface at the seam where your application talks to its source of truth:

```ts
import {
  createAddressResolver,
  type AddressCandidate,
  type AddressIndex,
  type AddressMatch,
} from "@marvin-amador-7/address-interpreter";

interface PropertyRecord {
  propertyId: string;
  address: string;
}

declare function findProperty(
  candidate: AddressCandidate,
): Promise<PropertyRecord | undefined>;

const propertyIndex: AddressIndex<PropertyRecord> = {
  async lookupCandidates(candidates) {
    const possibleMatches = await Promise.all(
      candidates.map(async (candidate) => {
        const property = await findProperty(candidate);

        if (!property) return undefined;

        return {
          candidateId: candidate.id,
          entityId: property.propertyId,
          value: property,
        } satisfies AddressMatch<PropertyRecord>;
      }),
    );

    return possibleMatches.filter(
      (match): match is AddressMatch<PropertyRecord> => match !== undefined,
    );
  },
};

const resolver = createAddressResolver(propertyIndex);

const resolution = await resolver.resolve({
  deliveryLine: "123 State Spur 5",
  city: "Houston",
  state: "TX",
  postalCode: "77001",
});

switch (resolution.status) {
  case "resolved":
    console.log(resolution.match.value);
    break;
  case "ambiguous":
    console.error("Candidates matched different properties");
    break;
  case "not-found":
    console.log("No candidate matched");
    break;
  case "invalid":
    console.error(resolution.interpretation.diagnostics);
    break;
}
```

Your adapter may query candidates in parallel, translate them to vendor-specific fields, batch them into one SQL statement, or look them up from a precomputed key table. The package deliberately knows nothing about your storage architecture.

### The `entityId` invariant

`entityId` is the resolver's proof of identity. Treat it as a correctness-critical field.

- One matching entity ID resolves.
- Several candidate matches with the same entity ID resolve as aliases of one entity.
- Matches with different entity IDs return `ambiguous`.
- If your data source cannot prove two matches are the same entity, give them distinct IDs and fail closed.

When aliases share an `entityId`, the resolver returns the first match's `value`. Your adapter must therefore ensure that the same `entityId` always means the same interchangeable entity.

Do not derive identity from incidental data such as a photo URL, display address, owner name, or normalized street string.

## Resolution states

| Status      | Meaning                                                               | Is the index called? |
| ----------- | --------------------------------------------------------------------- | -------------------- |
| `resolved`  | At least one match exists and every match identifies the same entity. | Yes                  |
| `ambiguous` | Candidate matches identify more than one entity.                      | Yes                  |
| `not-found` | The input produced candidates, but none matched.                      | Yes                  |
| `invalid`   | The input could not produce a candidate.                              | No                   |

Infrastructure errors from your adapter are not converted into `not-found`. They reject normally so callers can distinguish an unavailable index from a genuine miss.

## Interface reference

### `interpretAddress(input)`

```ts
interface AddressInput {
  deliveryLine: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

function interpretAddress(input: AddressInput): AddressInterpretation;
```

`deliveryLine` contains the primary address and optional secondary unit. Pass locality fields separately. The function does not attempt to guess where a city ends and a street begins inside one concatenated string.

The function is synchronous, deterministic, side-effect free, and returns diagnostics instead of throwing for unsupported input.

### `AddressInterpretation`

```ts
interface AddressInterpretation {
  tokens: readonly AddressToken[];
  candidates: readonly AddressCandidate[];
  diagnostics: readonly AddressDiagnostic[];
}
```

An ordinary supported address normally has one candidate. A bare trailing unit-shaped token may produce two. Invalid input has no candidates and at least one diagnostic.

### `AddressCandidate`

```ts
interface AddressCandidate {
  id: string;
  components: AddressComponents;
  assumptions: readonly string[];
  sourceSpans: {
    houseNumber: SourceSpan;
    street: SourceSpan;
    secondary?: SourceSpan;
  };
}
```

Current candidate IDs are:

| ID                         | Meaning                                                     |
| -------------------------- | ----------------------------------------------------------- |
| `literal`                  | No structural ambiguity was introduced by the interpreter.  |
| `explicit-unit`            | A recognized unit designator supplied explicit evidence.    |
| `trailing-token-as-unit`   | A bare trailing token is interpreted as the unit number.    |
| `trailing-token-as-street` | The same trailing token remains part of the literal street. |

`assumptions` records choices that are not explicit in the input. It is empty for literal and explicit-unit candidates.

### `AddressComponents`

```ts
interface AddressComponents {
  houseNumber: string;
  preDirectional?: string;
  streetName: string;
  streetSuffix?: string;
  postDirectional?: string;
  secondary?: {
    designator?: string;
    number?: string;
  };
  city?: string;
  state?: string;
  postalCode?: string;
}
```

Recognized values are normalized to uppercase. Known directionals, street suffixes, and secondary-unit designators use their abbreviated forms. Unrecognized or suffixless street text remains a literal `streetName`.

### `createAddressResolver(index)`

```ts
interface AddressIndex<T> {
  lookupCandidates(
    candidates: readonly AddressCandidate[],
  ): Promise<readonly AddressMatch<T>[]>;
}

function createAddressResolver<T>(index: AddressIndex<T>): AddressResolver<T>;
```

For valid input the resolver calls `lookupCandidates` once with the complete candidate set. This lets the adapter decide whether one batch, parallel probes, or sequential fallback is appropriate for its data source.

## Normalization behavior

The interpreter currently handles:

- mixed case and repeated whitespace;
- terminal commas, semicolons, colons, and periods;
- periods inside alphabetic abbreviations such as `N.E.`;
- eight cardinal and intercardinal directionals in abbreviated or full-word form;
- common street suffix names, abbreviations, and misspellings;
- common USPS secondary-unit designators and long forms;
- Puerto Rico `CARR` route notation;
- hyphenated house numbers and unit-shaped tokens;
- pre-directionals, post-directionals, and post-directionals before explicit units;
- multi-token explicit unit numbers;
- suffixless literal streets.

Normalization tables are informed by USPS Publication 28:

- [Appendix C1 — Street Suffix Abbreviations](https://pe.usps.com/text/pub28/28apc_002.htm)
- [Appendix C2 — Secondary Unit Designators](https://pe.usps.com/text/pub28/pub28apc_003.htm)
- [Section 233 — Directionals](https://pe.usps.com/text/pub28/28c2_014.htm)

This package is not affiliated with or endorsed by the United States Postal Service.

## Diagnostics

```ts
type AddressDiagnostic = "missing-house-number" | "unrecognized-delivery-line";
```

Example:

```ts
interpretAddress({ deliveryLine: "Main St" });

// {
//   tokens: [...],
//   candidates: [],
//   diagnostics: ["missing-house-number"],
// }
```

Diagnostics describe interpretation failure only. They do not assert whether an address is deliverable, occupied, geocodable, or present in your database.

## Guarantees and non-goals

### Guarantees

- Original token text and source offsets are retained.
- Recognized components normalize deterministically.
- Invalid input does not query the address index.
- Ambiguity is decided by distinct entity IDs, not candidate count.
- There are no runtime dependencies or hidden network calls.
- Both ESM and CommonJS consumers receive the same implementation.
- TypeScript declarations are included in the published package.

### Non-goals

- **Deliverability validation:** this is not CASS, DPV, or an authoritative USPS lookup.
- **Geocoding:** no coordinates, parcel IDs, or spatial matching are produced.
- **Fuzzy matching:** misspelled street names are not searched against a corpus.
- **Locality extraction:** city, state, and postal code are not inferred from one full-address string.
- **PO boxes and intersections:** these forms are not currently interpreted.
- **International addresses:** the grammar and normalization tables target US-style delivery lines.
- **Certainty without evidence:** ambiguous syntax remains ambiguous until an index resolves it.

Street and unit vocabularies are finite. If a token is not recognized structurally, the interpreter prefers preserving it as literal street text over inventing a component.

## Security and query construction

Candidates contain normalized strings, not trusted SQL fragments. Adapters must still use parameterized queries or the equivalent escaping mechanism for their data source.

The resolver assumes its adapter enforces authorization, tenant scope, and data-access policy. This module performs address interpretation and identity comparison only.

## Testing

The package currently carries 80 tests across the interpreter and resolver. The suite covers:

- ambiguous bare units and route-shaped addresses;
- explicit, numberless, attached-`#`, and multi-token secondary units;
- punctuation, apostrophes, directionals, suffixes, and source spans;
- suffixless streets and invalid delivery lines;
- resolved, ambiguous, not-found, and invalid resolver outcomes;
- multiple candidate aliases that identify one entity.

Run the full quality gate:

```sh
npm run check
```

That command performs strict TypeScript checking, runs the test suite, and builds ESM, CommonJS, source maps, and declarations.

Inspect the exact npm publish allowlist:

```sh
npm run package:files
```

## Compatibility

| Surface              | Support                                   |
| -------------------- | ----------------------------------------- |
| Node.js              | `>=18`                                    |
| ESM                  | `dist/index.js`                           |
| CommonJS             | `dist/index.cjs`                          |
| TypeScript           | Bundled `.d.ts` and `.d.cts` declarations |
| Runtime dependencies | None                                      |

The package is pre-1.0. Pin an exact version in high-risk systems and review release notes before upgrading normalization or candidate semantics.

## Release process

Releases are automated with [Release Please](https://github.com/googleapis/release-please) and npm Trusted Publishing:

1. Conventional commits on `main` update an automatically maintained release pull request.
2. Merging that pull request updates `package.json` and `CHANGELOG.md`, creates the version tag, and creates the GitHub Release.
3. The tagged source is installed from `package-lock.json` and must pass `npm run check`.
4. GitHub Actions publishes to npm through a short-lived OIDC identity.
5. npm attaches provenance linking the package tarball to its public source and workflow.

Commit messages follow Conventional Commits:

- `fix:` produces a patch release;
- `feat:` produces a minor release;
- `feat!:` or a `BREAKING CHANGE:` footer produces a major release.

## Contributing

A useful address fixture includes more than an expected component object. Please capture:

1. the raw delivery line and separate locality fields;
2. every structurally plausible interpretation;
3. the source spans that justify each interpretation;
4. whether real index evidence can disambiguate it;
5. the failure consequence if the wrong entity is returned.

Changes should preserve the central invariant: syntax may generate candidates, but only data may establish identity.

## License

[MIT](./LICENSE) © Marvin Amador
