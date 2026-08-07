# @marvin-amador-7/address-interpreter

A dependency-free TypeScript module for interpreting US delivery lines without pretending ambiguous text has one certain meaning.

`3637 Snell Ave 231` can mean either an address on `SNELL AVE` with unit `231`, or the literal street `SNELL AVE 231`. The interpreter returns both candidates and lets an address index decide from real data.

## Install

```sh
npm install @marvin-amador-7/address-interpreter
```

## Interpret an address

```ts
import { interpretAddress } from "@marvin-amador-7/address-interpreter";

const interpretation = interpretAddress({
  deliveryLine: "3637 Snell Ave 231",
  city: "San Jose",
  state: "CA",
  postalCode: "95136",
});

for (const candidate of interpretation.candidates) {
  console.log(candidate.id, candidate.components);
}
```

The returned tokens retain their original text and source spans. Normalized components are uppercase and common USPS suffixes, directionals, and secondary-unit designators are abbreviated.

## Resolve with your own data

```ts
import {
  createAddressResolver,
  type AddressIndex,
} from "@marvin-amador-7/address-interpreter";

const index: AddressIndex<Property> = {
  async lookupCandidates(candidates) {
    return lookupProperties(candidates);
  },
};

const result = await createAddressResolver(index).resolve({
  deliveryLine: "123 State Spur 5",
  city: "Houston",
  state: "TX",
});

if (result.status === "ambiguous") {
  // Different candidates matched different entities. Fail closed.
}
```

Resolution returns `resolved`, `ambiguous`, `not-found`, or `invalid`. Multiple candidate matches resolve only when every match has the same `entityId`.

## Design principles

- Parsing preserves ambiguity; an external index resolves it.
- No network or database dependency is built into the module.
- Candidate IDs, assumptions, diagnostics, tokens, and source spans are explicit.
- Invalid input returns diagnostics instead of throwing.
