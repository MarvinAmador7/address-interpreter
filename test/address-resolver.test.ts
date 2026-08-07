import { describe, expect, test } from "vitest";
import {
  createAddressResolver,
  type AddressIndex,
  type AddressMatch,
} from "../src/index";

interface PropertyRecord {
  addressId: string;
}

describe("createAddressResolver", () => {
  test("resolves when the index finds one entity", async () => {
    const match: AddressMatch<PropertyRecord> = {
      candidateId: "explicit-unit",
      entityId: "property-42",
      value: { addressId: "attom-42" },
    };
    const index: AddressIndex<PropertyRecord> = {
      async lookupCandidates() {
        return [match];
      },
    };
    const resolver = createAddressResolver(index);

    const resolution = await resolver.resolve({
      deliveryLine: "123 Main St Apt 231-B",
      city: "Austin",
      state: "TX",
    });

    expect(resolution.status).toBe("resolved");
    if (resolution.status === "resolved") {
      expect(resolution.match).toEqual(match);
    }
  });

  test("reports ambiguity when candidate interpretations match different entities", async () => {
    const matches: AddressMatch<PropertyRecord>[] = [
      {
        candidateId: "trailing-token-as-unit",
        entityId: "property-unit",
        value: { addressId: "attom-unit" },
      },
      {
        candidateId: "trailing-token-as-street",
        entityId: "property-route",
        value: { addressId: "attom-route" },
      },
    ];
    const resolver = createAddressResolver<PropertyRecord>({
      async lookupCandidates() {
        return matches;
      },
    });

    const resolution = await resolver.resolve({
      deliveryLine: "123 State Spur 5",
      city: "Houston",
      state: "TX",
    });

    expect(resolution.status).toBe("ambiguous");
    if (resolution.status === "ambiguous") {
      expect(resolution.matches).toEqual(matches);
    }
  });

  test("returns invalid without querying the index when there are no candidates", async () => {
    let indexWasCalled = false;
    const resolver = createAddressResolver<PropertyRecord>({
      async lookupCandidates() {
        indexWasCalled = true;
        return [];
      },
    });

    const resolution = await resolver.resolve({
      deliveryLine: "Main St",
      city: "Austin",
      state: "TX",
    });

    expect(resolution.status).toBe("invalid");
    expect(indexWasCalled).toBe(false);
    expect(resolution.interpretation.diagnostics).toEqual([
      "missing-house-number",
    ]);
  });

  test("returns not-found when valid candidates have no index matches", async () => {
    const resolver = createAddressResolver<PropertyRecord>({
      async lookupCandidates() {
        return [];
      },
    });

    const resolution = await resolver.resolve({
      deliveryLine: "3637 Snell Ave 231",
      city: "San Jose",
      state: "CA",
      postalCode: "95136",
    });

    expect(resolution.status).toBe("not-found");
  });

  test("resolves aliases from both candidates when they identify the same entity", async () => {
    const resolver = createAddressResolver<PropertyRecord>({
      async lookupCandidates() {
        return [
          {
            candidateId: "trailing-token-as-unit",
            entityId: "property-42",
            value: { addressId: "attom-42" },
          },
          {
            candidateId: "trailing-token-as-street",
            entityId: "property-42",
            value: { addressId: "attom-42" },
          },
        ];
      },
    });

    const resolution = await resolver.resolve({
      deliveryLine: "3637 Snell Ave 231",
      city: "San Jose",
      state: "CA",
    });

    expect(resolution.status).toBe("resolved");
    if (resolution.status === "resolved") {
      expect(resolution.match.entityId).toBe("property-42");
    }
  });
});
