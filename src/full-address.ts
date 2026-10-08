import type {
  AddressCandidate,
  AddressInterpretation,
  AddressInterpretationOptions,
  AddressToken,
  SourceSpan,
} from "./types";
import { interpretDeliveryTokens } from "./delivery";
import { createStreetSpellingExpander } from "./spelling";
import {
  ADDRESS_LIMITS,
  hasSeparator,
  inputDiagnostic,
  optionsDiagnostic,
  normalizePostalCode,
  span,
  tokenize,
  words,
} from "./tokens";
import { STATE_ABBREVIATIONS, STATE_NAMES } from "./vocabulary";
import { isSecondaryBoundary } from "./street";

interface StateEnding {
  start: number;
  end: number;
  abbreviation: string;
}
interface LocalityEnding {
  end: number;
  state?: StateEnding;
  postal?: { start: number; end: number; value: string };
}

function trailingState(
  tokens: readonly AddressToken[],
  end: number,
  input: string,
): StateEnding | undefined {
  const final = tokens[end - 1];
  if (final && STATE_ABBREVIATIONS.has(final.normalized))
    return { start: end - 1, end, abbreviation: final.normalized };
  for (let size = Math.min(4, end); size > 0; size -= 1) {
    const nameTokens = tokens.slice(end - size, end);
    if (
      nameTokens.some(
        (token, index) =>
          index > 0 && hasSeparator(input, nameTokens[index - 1], token),
      )
    )
      continue;
    const abbreviation = STATE_NAMES[words(nameTokens)];
    if (abbreviation) return { start: end - size, end, abbreviation };
  }
  return undefined;
}

function countryStart(
  tokens: readonly AddressToken[],
  input: string,
): number | undefined {
  for (const count of [4, 2, 1]) {
    const start = tokens.length - count;
    if (start < 1) continue;
    const name = words(tokens.slice(start));
    if (
      !["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"].includes(name)
    )
      continue;
    if (
      hasSeparator(input, tokens[start - 1], tokens[start]) ||
      /^\d{5}(?:-?\d{4})?$/.test(tokens[start - 1].normalized)
    )
      return start;
  }
  return undefined;
}

function spanKey(
  value: SourceSpan | readonly SourceSpan[] | undefined,
): string {
  if (!value) return "none";
  if ("start" in value) return `${value.start}-${value.end}`;
  return value.map(spanKey).join("+");
}

/** Enumerate supported boundaries; an index must decide which address exists. */
export function interpretFullAddress(
  fullAddress: string,
  options?: AddressInterpretationOptions,
): AddressInterpretation {
  const diagnostic =
    inputDiagnostic({ deliveryLine: fullAddress }) ??
    optionsDiagnostic(options);
  if (diagnostic)
    return { tokens: [], candidates: [], diagnostics: [diagnostic] };
  const tokens = tokenize(fullAddress);
  if (tokens.length > ADDRESS_LIMITS.tokens)
    return { tokens, candidates: [], diagnostics: ["input-too-long"] };
  let content = tokens.filter((token) => token.normalized);
  let countrySpan: SourceSpan | undefined;
  const countryIndex = countryStart(content, fullAddress);
  if (countryIndex !== undefined) {
    countrySpan = span(content[countryIndex], content[content.length - 1]);
    content = content.slice(0, countryIndex);
  }

  // URB is a separate address line, not a street/city hint. Keep its source range.
  let urbanization: string | undefined;
  let urbanizationSpan: SourceSpan | undefined;
  for (let index = 0; index < content.length; index += 1) {
    if (
      content[index].normalized !== "URB" ||
      (index > 0 &&
        !hasSeparator(fullAddress, content[index - 1], content[index]))
    )
      continue;
    let end = index + 1;
    while (
      end < content.length &&
      !hasSeparator(fullAddress, content[end - 1], content[end])
    )
      end += 1;
    if (end <= index + 1 || end === content.length || urbanizationSpan)
      continue;
    urbanization = words(content.slice(index + 1, end));
    urbanizationSpan = span(content[index], content[end - 1]);
    content = [...content.slice(0, index), ...content.slice(end)];
    break;
  }

  const baseInput = { deliveryLine: fullAddress };
  const spellings =
    options?.spellingAlternatives === false
      ? undefined
      : createStreetSpellingExpander();
  const deliveryOnly = interpretDeliveryTokens(content, baseInput, spellings);
  if (deliveryOnly.diagnostics.includes("too-many-candidates"))
    return { ...deliveryOnly, tokens };
  const final = content[content.length - 1];
  let postal: LocalityEnding["postal"];
  if (final && /^\d{5}(?:-?\d{4})?$/.test(final.normalized)) {
    postal = {
      start: content.length - 1,
      end: content.length,
      value: normalizePostalCode(final.normalized)!,
    };
  } else if (
    final &&
    /^\d{4}$/.test(final.normalized) &&
    /^\d{5}$/.test(content[content.length - 2]?.normalized ?? "") &&
    trailingState(content, content.length - 2, fullAddress)
  ) {
    postal = {
      start: content.length - 2,
      end: content.length,
      value: `${content[content.length - 2].normalized}-${final.normalized}`,
    };
  }
  const state = trailingState(
    content,
    postal?.start ?? content.length,
    fullAddress,
  );
  const separated = content.some(
    (token, index) =>
      index > 0 && hasSeparator(fullAddress, content[index - 1], token),
  );
  const extraComponents = {
    ...(countrySpan ? { country: "US" as const } : {}),
    ...(urbanization ? { urbanization } : {}),
  };
  const extraSpans = {
    ...(countrySpan ? { country: countrySpan } : {}),
    ...(urbanizationSpan ? { urbanization: urbanizationSpan } : {}),
  };
  const completeDelivery = deliveryOnly.candidates.some(
    (candidate) =>
      candidate.components.streetSuffix ||
      candidate.components.secondary ||
      candidate.components.kind,
  );
  if (
    !postal &&
    !state &&
    !separated &&
    (completeDelivery || content.length < 4)
  )
    return {
      ...deliveryOnly,
      tokens,
      candidates: deliveryOnly.candidates.map((candidate) => ({
        ...candidate,
        components: { ...candidate.components, ...extraComponents },
        sourceSpans: { ...candidate.sourceSpans, ...extraSpans },
      })),
    };

  const endings: LocalityEnding[] = [];
  if (state) endings.push({ end: state.start, state, postal });
  const explicitState =
    state &&
    state.start > 0 &&
    hasSeparator(fullAddress, content[state.start - 1], content[state.start]);
  if (!state || !explicitState)
    endings.push({ end: postal?.start ?? content.length, postal });
  const candidates: AddressCandidate[] = [];
  const keys = new Set<string>();
  const cache = new Map<number, AddressInterpretation>();
  const add = (candidate: AddressCandidate) => {
    const sourceSpans = { ...candidate.sourceSpans, ...extraSpans };
    const components = { ...candidate.components, ...extraComponents };
    const key = JSON.stringify({ components, sourceSpans });
    if (keys.has(key)) return;
    keys.add(key);
    candidates.push({
      ...candidate,
      components,
      sourceSpans,
      id: `${candidate.id}:full:${Object.entries(sourceSpans)
        .map(([name, value]) => `${name}=${spanKey(value)}`)
        .join(":")}`,
    });
  };

  for (const ending of endings) {
    const boundaries: number[] = [];
    for (let split = 2; split < ending.end; split += 1) {
      if (hasSeparator(fullAddress, content[split - 1], content[split]))
        boundaries.push(split);
    }
    const splits = boundaries.length
      ? [...boundaries, ending.end]
      : Array.from(
          { length: Math.max(0, ending.end - 1) },
          (_, index) => index + 2,
        );
    for (const split of splits) {
      const cityTokens = content.slice(split, ending.end);
      // A delimiter can introduce a secondary line or end a validated leading
      // secondary phrase. Check the latter against each reading's source spans.
      const leadingBoundaries: number[] = [];
      for (let boundary = 1; boundary < split; boundary += 1) {
        if (
          hasSeparator(fullAddress, content[boundary - 1], content[boundary]) &&
          !isSecondaryBoundary(content, boundary)
        )
          leadingBoundaries.push(boundary);
      }
      if (leadingBoundaries.length > 1) continue;
      if (cityTokens.length) {
        if (
          !cityTokens.every((token) =>
            /^[\p{L}\p{M}.'’\-]+$/u.test(token.normalized),
          )
        )
          continue;
        if (
          cityTokens.some(
            (token, index) =>
              index > 0 &&
              hasSeparator(fullAddress, cityTokens[index - 1], token),
          )
        )
          continue;
      }
      let delivery = cache.get(split);
      if (!delivery) {
        delivery = interpretDeliveryTokens(
          content.slice(0, split),
          baseInput,
          spellings,
        );
        if (delivery.diagnostics.includes("too-many-candidates"))
          return {
            tokens,
            candidates: [],
            diagnostics: ["too-many-candidates"],
          };
        cache.set(split, delivery);
      }
      const citySpan = cityTokens.length
        ? span(cityTokens[0], cityTokens[cityTokens.length - 1])
        : undefined;
      const stateSpan = ending.state
        ? span(content[ending.state.start], content[ending.state.end - 1])
        : undefined;
      const postalSpan = ending.postal
        ? span(content[ending.postal.start], content[ending.postal.end - 1])
        : undefined;
      for (const candidate of delivery.candidates) {
        if (
          leadingBoundaries.some(
            (boundary) =>
              !candidate.assumptions.includes("secondary-before-house-number") ||
              candidate.sourceSpans.secondary?.end !== content[boundary - 1].end ||
              candidate.sourceSpans.houseNumber?.start !== content[boundary].start,
          )
        )
          continue;
        add({
          ...candidate,
          components: {
            ...candidate.components,
            city: cityTokens.length ? words(cityTokens) : undefined,
            state: ending.state?.abbreviation,
            postalCode: ending.postal?.value,
          },
          sourceSpans: {
            ...candidate.sourceSpans,
            ...(citySpan ? { city: citySpan } : {}),
            ...(stateSpan ? { state: stateSpan } : {}),
            ...(postalSpan ? { postalCode: postalSpan } : {}),
          },
          assumptions: [
            ...candidate.assumptions,
            ...(citySpan &&
            !hasSeparator(fullAddress, content[split - 1], cityTokens[0])
              ? ["street-city-boundary-inferred"]
              : []),
            ...(stateSpan ? ["trailing-state-is-locality"] : []),
            ...(postalSpan ? ["trailing-postal-code-is-locality"] : []),
          ],
        });
        if (candidates.length > ADDRESS_LIMITS.candidates)
          return {
            tokens,
            candidates: [],
            diagnostics: ["too-many-candidates"],
          };
      }
    }
  }
  // Without delimiters a ZIP or state-shaped ending can still belong to delivery.
  if (!separated)
    for (const candidate of deliveryOnly.candidates)
      add({
        ...candidate,
        assumptions: [
          ...candidate.assumptions,
          "trailing-locality-shaped-tokens-are-delivery-line",
        ],
      });
  if (candidates.length > ADDRESS_LIMITS.candidates)
    return { tokens, candidates: [], diagnostics: ["too-many-candidates"] };
  return {
    tokens,
    candidates,
    diagnostics: candidates.length
      ? []
      : deliveryOnly.diagnostics.length
        ? deliveryOnly.diagnostics
        : ["unrecognized-delivery-line"],
  };
}
