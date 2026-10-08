import type {
  AddressIndex,
  AddressInterpretation,
  AddressResolution,
  AddressResolver,
  FullAddressResolver,
} from "./types";
import { interpretAddress } from "./delivery";
import { interpretFullAddress } from "./full-address";

async function resolveInterpretation<T>(
  interpretation: AddressInterpretation,
  index: AddressIndex<T>,
): Promise<AddressResolution<T>> {
  if (interpretation.candidates.length === 0) {
    return { status: "invalid", interpretation };
  }

  const candidateIds = new Set(
    interpretation.candidates.map((candidate) => candidate.id),
  );
  const matches = await index.lookupCandidates(interpretation.candidates);
  if (
    !Array.isArray(matches) ||
    matches.some(
      (match) =>
        !match ||
        typeof match !== "object" ||
        !candidateIds.has(match.candidateId) ||
        typeof match.entityId !== "string" ||
        !match.entityId.trim(),
    )
  ) {
    throw new TypeError(
      "AddressIndex returned invalid matches: each match must reference a supplied candidateId and a non-empty entityId",
    );
  }

  if (new Set(matches.map((match) => match.entityId)).size > 1) {
    return { status: "ambiguous", interpretation, matches };
  }

  if (matches[0]) {
    return { status: "resolved", interpretation, match: matches[0] };
  }

  return { status: "not-found", interpretation };
}

export function createAddressResolver<T>(
  index: AddressIndex<T>,
): AddressResolver<T> {
  return {
    async resolve(input) {
      return resolveInterpretation(interpretAddress(input), index);
    },
  };
}

export function createFullAddressResolver<T>(
  index: AddressIndex<T>,
): FullAddressResolver<T> {
  return {
    async resolve(fullAddress) {
      return resolveInterpretation(interpretFullAddress(fullAddress), index);
    },
  };
}
