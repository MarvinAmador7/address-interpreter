import type {
  AddressInput,
  AddressInterpretation,
  AddressInterpretationOptions,
  AddressToken,
} from "./types";
import {
  ADDRESS_LIMITS,
  inputDiagnostic,
  optionsDiagnostic,
  locality,
  tokenize,
} from "./tokens";
import { postalCandidate } from "./postal";
import {
  parseHouse,
  streetCandidates,
  streetBoundaryAlternatives,
} from "./street";
import { feedFormatAlternatives, repairFeedTokens } from "./feed-format";
import { UNIT_DESIGNATORS } from "./vocabulary";
import { candidateLimitExceeded, createCandidateSet } from "./candidate-set";
import {
  createStreetSpellingExpander,
  type StreetSpellingExpander,
} from "./spelling";

/** Internal entry point lets locality enumeration reuse token offsets and work. */
export function interpretDeliveryTokens(
  tokens: readonly AddressToken[],
  input: AddressInput,
  spellings: StreetSpellingExpander | undefined,
): AddressInterpretation {
  const semantic = tokens.filter((token) => token.normalized);
  const firstStart = semantic[0]?.start;
  const postal = postalCandidate(semantic);
  if (postal)
    return {
      tokens,
      candidates: [
        { ...postal, components: { ...postal.components, ...locality(input) } },
      ],
      diagnostics: [],
    };
  const repaired = repairFeedTokens(semantic, input.deliveryLine);
  const readings: Array<{
    tokens: readonly AddressToken[];
    assumptions: string[];
    prefixSecondaryEnd?: number;
  }> = [
    { tokens: semantic, assumptions: [] as string[] },
    ...(repaired ? [repaired] : []),
  ];
  // Apartment/building lines can precede the numbered street. Rotate one short
  // explicit secondary phrase while retaining every original token and offset.
  if (UNIT_DESIGNATORS[semantic[0]?.normalized]) {
    for (
      let boundary = 2;
      boundary <= 4 && boundary < semantic.length - 2;
      boundary++
    ) {
      if (!parseHouse(semantic.slice(boundary))) continue;
      readings.push({
        tokens: [...semantic.slice(boundary), ...semantic.slice(0, boundary)],
        assumptions: ["secondary-before-house-number"],
        prefixSecondaryEnd: semantic[boundary - 1].end,
      });
    }
  }
  const candidates = createCandidateSet();
  let hasHouse = false;
  let incompleteSecondary = false;
  try {
    for (const reading of readings) {
      const house = parseHouse(reading.tokens);
      if (!house) continue;
      hasHouse = true;
      const semantic = reading.tokens;
      const result = streetCandidates(semantic, house);
      // A separated numeric range may also be a numbered street. Preserve both.
      if (
        house.length === 1 &&
        /^\d+$/.test(semantic[0].normalized) &&
        /^\d+$/.test(semantic[1]?.normalized ?? "") &&
        semantic.length > 2 &&
        // Joined-street repair can split "42AVE" into "42" + "AVE".
        // Its numeric fragment is not a separately observed house identifier.
        (semantic[1].end < semantic[2].start ||
          tokens.some((token) => token.end === semantic[1].end))
      ) {
        const compound = streetCandidates(semantic, {
          value: `${house.value} ${semantic[1].normalized}`,
          length: 2,
        });
        result.candidates.push(
          ...compound.candidates.map((candidate) => ({
            ...candidate,
            id: `${candidate.id}:compound-house`,
            assumptions: [
              ...candidate.assumptions,
              "house-number-boundary-inferred",
            ],
          })),
        );
      }
      incompleteSecondary ||= !!result.incompleteSecondary;
      for (const base of result.candidates) {
        if (
          reading.prefixSecondaryEnd !== undefined &&
          (!base.components.streetSuffix ||
            base.sourceSpans.secondary?.start !== firstStart ||
            base.sourceSpans.secondary?.end !== reading.prefixSecondaryEnd)
        )
          continue;
        const candidate = reading.assumptions.length
          ? {
              ...base,
              id: `${base.id}:feed-format`,
              assumptions: [...base.assumptions, ...reading.assumptions],
            }
          : base;
        for (const name of [
          candidate,
          ...streetBoundaryAlternatives(candidate, semantic),
        ]) {
          candidates.addStructural(name);
          feedFormatAlternatives(
            name,
            semantic,
            spellings,
            candidates.addAlternative,
          );
        }
      }
    }
  } catch (error) {
    if (error !== candidateLimitExceeded) throw error;
    return { tokens, candidates: [], diagnostics: ["too-many-candidates"] };
  }
  const result = candidates.finish(input);
  if (!result.length)
    return {
      tokens,
      candidates: [],
      diagnostics: [
        !hasHouse
          ? "missing-house-number"
          : incompleteSecondary
            ? "incomplete-secondary"
            : "unrecognized-delivery-line",
      ],
    };
  return { tokens, candidates: result, diagnostics: [] };
}

export function interpretAddress(
  input: AddressInput,
  options?: AddressInterpretationOptions,
): AddressInterpretation {
  const diagnostic = inputDiagnostic(input) ?? optionsDiagnostic(options);
  if (diagnostic)
    return { tokens: [], candidates: [], diagnostics: [diagnostic] };
  const tokens = tokenize(input.deliveryLine);
  if (tokens.length > ADDRESS_LIMITS.tokens)
    return { tokens, candidates: [], diagnostics: ["input-too-long"] };
  return interpretDeliveryTokens(
    tokens,
    input,
    options?.spellingAlternatives === false
      ? undefined
      : createStreetSpellingExpander(),
  );
}
