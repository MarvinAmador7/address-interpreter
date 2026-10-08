import type { AddressCandidate, AddressInput } from "./types";
import { ADDRESS_LIMITS, locality } from "./tokens";

/** Internal sentinel aborts generation as soon as the complete set exceeds its budget. */
export const candidateLimitExceeded = Symbol("candidate-limit-exceeded");

/** Preserve structural-first ordering and first provenance while deduplicating on arrival. */
export function createCandidateSet() {
  const structural = new Map<string, AddressCandidate>();
  const alternatives = new Map<string, AddressCandidate>();
  let size = 0;
  const add = (
    candidate: AddressCandidate,
    target: Map<string, AddressCandidate>,
    other: Map<string, AddressCandidate>,
  ) => {
    const key = JSON.stringify(candidate.components);
    if (target.has(key) || (target === alternatives && other.has(key))) return;
    if (!other.has(key) && ++size > ADDRESS_LIMITS.candidates)
      throw candidateLimitExceeded;
    target.set(key, candidate);
  };
  return {
    addStructural(candidate: AddressCandidate) {
      add(candidate, structural, alternatives);
    },
    addAlternative(candidate: AddressCandidate) {
      // A structural reading always wins, even if discovered after this alias.
      add(candidate, alternatives, structural);
    },
    finish(input: AddressInput): AddressCandidate[] {
      const used = new Set<string>();
      const place = locality(input);
      const result: AddressCandidate[] = [];
      const append = (candidate: AddressCandidate) => {
        let id = candidate.id;
        if (used.has(id)) id += `:${candidate.sourceSpans.street?.end}`;
        const stem = id;
        let occurrence = 2;
        while (used.has(id)) id = `${stem}:${occurrence++}`;
        used.add(id);
        result.push({
          ...candidate,
          id,
          components: { ...candidate.components, ...place },
        });
      };
      for (const candidate of structural.values()) append(candidate);
      for (const [key, candidate] of alternatives)
        if (!structural.has(key)) append(candidate);
      return result;
    },
  };
}
