import type {
  AddressCandidate,
  AddressToken,
  SecondaryAddress,
  SourceSpan,
  StreetAddressComponents,
} from "./types";
import {
  DIRECTIONALS,
  UNIT_DESIGNATORS,
  UNIT_DESIGNATORS_WITHOUT_NUMBER,
} from "./vocabulary";
import { STREET_SUFFIXES } from "./street-suffixes";
import { span, words } from "./tokens";

type Street = Pick<
  StreetAddressComponents,
  "preDirectional" | "streetName" | "streetSuffix" | "postDirectional"
>;

function directional(
  tokens: readonly AddressToken[],
  atEnd = false,
): { value: string; length: number } | undefined {
  const pair = atEnd ? tokens.slice(-2) : tokens.slice(0, 2);
  if (pair.length === 2) {
    const first = DIRECTIONALS[pair[0].normalized];
    const second = DIRECTIONALS[pair[1].normalized];
    if (
      (first === "N" || first === "S") &&
      (second === "E" || second === "W")
    ) {
      return { value: first + second, length: 2 };
    }
  }
  const token = atEnd ? tokens[tokens.length - 1] : tokens[0];
  const value = token && DIRECTIONALS[token.normalized];
  return value ? { value, length: 1 } : undefined;
}

/** One street grammar is shared by literal, explicit-unit and bare-unit readings. */
function parseStreet(
  tokens: readonly AddressToken[],
  unitBoundary = false,
  literal = false,
): Street | undefined {
  if (
    !tokens.length ||
    !tokens.some((token) => /[\p{L}\p{N}]/u.test(token.normalized)) ||
    !tokens.every(
      (token, index) =>
        token.normalized === "#" ||
        /[\p{L}\p{N}]/u.test(token.normalized) ||
        (token.normalized === "-" &&
          index > 0 &&
          index < tokens.length - 1 &&
          /[\p{L}\p{N}]$/u.test(tokens[index - 1].normalized) &&
          /^[\p{L}\p{N}]/u.test(tokens[index + 1].normalized)),
    )
  )
    return undefined;
  let end = tokens.length;
  let post = literal ? undefined : directional(tokens, true);
  if (post) {
    const before = tokens[end - post.length - 1];
    const grid = before && /^\d+(?:\.\d+)?$/.test(before.normalized);
    if (
      !before ||
      !(STREET_SUFFIXES.has(before.normalized) || unitBoundary || grid)
    )
      post = undefined;
  }
  if (post) end -= post.length;
  const suffix =
    !literal && end > 1
      ? STREET_SUFFIXES.get(tokens[end - 1].normalized)
      : undefined;
  if (suffix) end -= 1;
  let possiblePre = directional(tokens.slice(0, end));
  if (possiblePre?.length === 2 && end === 2)
    possiblePre = directional(tokens.slice(0, 1));
  const pre = possiblePre && end > possiblePre.length ? possiblePre : undefined;
  const start = pre?.length ?? 0;
  if (end <= start) return undefined;
  if (
    !tokens
      .slice(start, end)
      .some((token) => /[\p{L}\p{N}]/u.test(token.normalized))
  )
    return undefined;
  return {
    ...(pre ? { preDirectional: pre.value } : {}),
    streetName: words(tokens.slice(start, end)),
    ...(suffix ? { streetSuffix: suffix } : {}),
    ...(post ? { postDirectional: post.value } : {}),
  };
}

interface House {
  value: string;
  length: number;
}

export function parseHouse(tokens: readonly AddressToken[]): House | undefined {
  const first = tokens[0]?.normalized;
  if (
    !first ||
    !/^(?=.*\d)[A-Z0-9]+(?:[-/.][A-Z0-9]+)*(?: \d+\/[1-9]\d*)?$/.test(first)
  )
    return undefined;
  const second = tokens[1]?.normalized;
  if (second && /^\d+\/[1-9]\d*$/.test(second) && !first.includes("/")) {
    return { value: `${first} ${second}`, length: 2 };
  }
  if (
    second &&
    ((/^[NS]\d+$/.test(first) && /^[EW]\d+$/.test(second)) ||
      (/^[EW]\d+$/.test(first) && /^[NS]\d+$/.test(second)))
  ) {
    return { value: `${first} ${second}`, length: 2 };
  }
  return { value: first, length: 1 };
}

function parseSecondaries(
  tokens: readonly AddressToken[],
):
  | { units: SecondaryAddress[]; ranges: ReturnType<typeof span>[] }
  | undefined {
  const units: SecondaryAddress[] = [];
  const ranges: ReturnType<typeof span>[] = [];
  let index = 0;
  while (index < tokens.length) {
    if (
      index > 0 &&
      tokens[index].normalized === "-" &&
      isSecondaryBoundary(tokens, index + 1)
    )
      index++;
    const start = index;
    const ordinal = ordinalFloorNumber(tokens, index);
    if (ordinal) {
      units.push({ designator: "FL", number: ordinal });
      ranges.push(span(tokens[index], tokens[index + 1]));
      index += 2;
      continue;
    }
    const designator = UNIT_DESIGNATORS[tokens[index].normalized];
    if (!designator) return undefined;
    index += 1;
    // "APT #4" is one designator and one identifier, not two nested units.
    if (designator !== "#" && tokens[index]?.normalized === "#") {
      index += 1;
      if (index === tokens.length) return undefined;
    }
    const numberStart = index;
    // Required identifiers can themselves be designator words, e.g. APT PH.
    if (
      !UNIT_DESIGNATORS_WITHOUT_NUMBER.has(designator) &&
      index < tokens.length
    )
      index += 1;
    const internalHash = (at: number) =>
      tokens[at]?.normalized === "#" &&
      at > numberStart &&
      tokens[at - 1].end === tokens[at].start &&
      tokens[at].end === tokens[at + 1]?.start;
    while (
      index < tokens.length &&
      (!(
        isSecondaryBoundary(tokens, index) ||
        (tokens[index].normalized === "-" &&
          isSecondaryBoundary(tokens, index + 1))
      ) ||
        internalHash(index) ||
        internalHash(index - 1))
    )
      index += 1;
    const numberTokens = tokens.slice(numberStart, index);
    const number = numberTokens
      .map((token, at) => {
        const previous = numberTokens[at - 1];
        const attached =
          previous &&
          previous.end === token.start &&
          (previous.normalized === "#" || token.normalized === "#");
        return `${at && !attached ? " " : ""}${token.normalized}`;
      })
      .join("");
    if (!number && !UNIT_DESIGNATORS_WITHOUT_NUMBER.has(designator))
      return undefined;
    if (number && !/[\p{L}\p{N}]/u.test(number)) return undefined;
    units.push({ designator, ...(number ? { number } : {}) });
    ranges.push(span(tokens[start], tokens[index - 1]));
  }
  return units.length ? { units, ranges } : undefined;
}

export interface StreetResult {
  candidates: AddressCandidate[];
  incompleteSecondary?: boolean;
}

const FLOOR_ORDINALS: Readonly<Record<string, string>> = {
  FIRST: "1",
  SECOND: "2",
  THIRD: "3",
  FOURTH: "4",
  FIFTH: "5",
  SIXTH: "6",
  SEVENTH: "7",
  EIGHTH: "8",
  NINTH: "9",
  TENTH: "10",
};

function ordinalFloorNumber(
  tokens: readonly AddressToken[],
  index: number,
): string | undefined {
  const number = tokens[index]?.normalized;
  if (
    !number ||
    !["FL", "FLR", "FLOOR"].includes(tokens[index + 1]?.normalized)
  )
    return undefined;
  return (
    FLOOR_ORDINALS[number] ??
    (/^\d+(?:ST|ND|RD|TH)?$/.test(number)
      ? number.replace(/(ST|ND|RD|TH)$/, "")
      : undefined)
  );
}

export function isSecondaryBoundary(
  tokens: readonly AddressToken[],
  index: number,
): boolean {
  const value = tokens[index]?.normalized;
  return (
    !!value &&
    (!!UNIT_DESIGNATORS[value] || !!ordinalFloorNumber(tokens, index))
  );
}

function appendSecondaryChain(
  candidate: AddressCandidate,
  units: readonly SecondaryAddress[],
  ranges: readonly SourceSpan[],
  id: string,
): AddressCandidate {
  const previous = candidate.components as StreetAddressComponents;
  const chain = [
    ...(previous.secondaryUnits ??
      (previous.secondary ? [previous.secondary] : [])),
    ...units,
  ];
  const evidence = [
    ...(candidate.sourceSpans.secondaryUnits ??
      (candidate.sourceSpans.secondary ? [candidate.sourceSpans.secondary] : [])),
    ...ranges,
  ];
  return {
    ...candidate,
    id: `${candidate.id}:${id}`,
    components: {
      ...previous,
      secondary: chain[chain.length - 1],
      ...(chain.length > 1 ? { secondaryUnits: chain } : {}),
    },
    sourceSpans: {
      ...candidate.sourceSpans,
      secondary: {
        start: evidence[0].start,
        end: evidence[evidence.length - 1].end,
      },
      ...(evidence.length > 1 ? { secondaryUnits: evidence } : {}),
    },
  };
}

function primaryStreetCandidates(
  tokens: readonly AddressToken[],
  house: House,
): StreetResult {
  const tail = tokens.slice(house.length);
  const candidates: AddressCandidate[] = [];
  const houseSpan = span(tokens[0], tokens[house.length - 1]);
  const make = (
    id: string,
    streetTokens: readonly AddressToken[],
    street: Street,
    assumptions: string[] = [],
  ): AddressCandidate => ({
    id,
    assumptions,
    sourceSpans: {
      houseNumber: houseSpan,
      street: span(streetTokens[0], streetTokens[streetTokens.length - 1]),
    },
    components: { houseNumber: house.value, ...street },
  });
  let anchoredUnit = false;
  let ambiguousUnit = false;
  let weakUnit = false;
  let firstUnanchoredKeyword = tail.length;
  const floorNumber = tail[tail.length - 2]?.normalized;
  if (
    tail.length >= 3 &&
    ["FLOOR", "FL", "FLR"].includes(tail[tail.length - 1].normalized) &&
    floorNumber &&
    (/^\d+(?:ST|ND|RD|TH)?$/.test(floorNumber) || FLOOR_ORDINALS[floorNumber])
  ) {
    const prefixEnd = tokens[tokens.length - 3]?.normalized === "-" ? -3 : -2;
    const prefix = streetCandidates(tokens.slice(0, prefixEnd), house);
    const floor = {
      designator: "FL",
      number:
        FLOOR_ORDINALS[floorNumber] ??
        floorNumber.replace(/(ST|ND|RD|TH)$/, ""),
    };
    const floorSpan = span(
      tail[tail.length + prefixEnd],
      tail[tail.length - 1],
    );
    return {
      candidates: prefix.candidates.map((candidate) =>
        appendSecondaryChain(candidate, [floor], [floorSpan], "ordinal-floor"),
      ),
      incompleteSecondary: prefix.incompleteSecondary,
    };
  }
  for (let index = 1; index < tail.length; index += 1) {
    if (!isSecondaryBoundary(tail, index)) continue;
    const designator = UNIT_DESIGNATORS[tail[index].normalized] ?? "FL";
    const hasSeparator = tail[index - 1].normalized === "-";
    const streetTokens = tail.slice(0, hasSeparator ? index - 1 : index);
    const street = parseStreet(streetTokens, true);
    if (!street) continue;
    if (candidates.length && !street.streetSuffix && !weakUnit) continue;
    // Numberless words embedded in suffixless names are weak evidence: Ocean Front 5.
    if (
      !street.streetSuffix &&
      UNIT_DESIGNATORS_WITHOUT_NUMBER.has(designator) &&
      index < tail.length - 1
    )
      continue;
    let secondaries = parseSecondaries(tail.slice(index));
    const keywordIdentifier =
      index === tail.length - 2 &&
      UNIT_DESIGNATORS_WITHOUT_NUMBER.has(designator) &&
      UNIT_DESIGNATORS[tail[index + 1].normalized] &&
      tail[index + 1].normalized !== "#";
    const identifierReading = keywordIdentifier
      ? {
          units: [{ designator, number: tail[index + 1].normalized }],
          ranges: [span(tail[index], tail[index + 1])],
        }
      : undefined;
    const onlyIdentifier = !secondaries && !!identifierReading;
    secondaries ??= identifierReading;
    const wholeBuilding =
      !secondaries &&
      street.streetSuffix &&
      index === tail.length - 1 &&
      tail[index].normalized === "BUILDING";
    if (wholeBuilding)
      secondaries = {
        units: [{ designator: "BLDG" }],
        ranges: [span(tail[index])],
      };
    if (!secondaries) {
      // Informal feed abbreviations can also be literal name/identifier words.
      // Recognize them as markers only when their required identifier follows.
      if (["SP", "FLR", "TOWER", "TWR"].includes(tail[index].normalized))
        continue;
      if (street.streetSuffix)
        return { candidates: [], incompleteSecondary: true };
      continue;
    }
    const anchored = !!street.streetSuffix;
    if (!anchored)
      firstUnanchoredKeyword = Math.min(firstUnanchoredKeyword, index);
    const terminalStreet = parseStreet(tail);
    const nameCollision = !!terminalStreet?.streetSuffix;
    anchoredUnit ||= anchored;
    ambiguousUnit ||= !anchored || nameCollision;
    weakUnit ||= designator === "TOWER";
    const candidate = make(
      anchored ? "explicit-unit" : "unit-keyword-as-unit",
      streetTokens,
      street,
      anchored ? [] : ["unit-keyword-is-unit"],
    );
    if (wholeBuilding)
      candidate.assumptions = [
        ...candidate.assumptions,
        "whole-building-label",
      ];
    candidate.components = {
      ...(candidate.components as StreetAddressComponents),
      secondary: secondaries.units[secondaries.units.length - 1],
      ...(secondaries.units.length > 1
        ? { secondaryUnits: secondaries.units }
        : {}),
    };
    candidate.sourceSpans.secondary = span(
      tail[hasSeparator ? index - 1 : index],
      tail[tail.length - 1],
    );
    if (secondaries.ranges.length > 1)
      candidate.sourceSpans.secondaryUnits = secondaries.ranges;
    candidates.push(candidate);
    if (identifierReading) {
      if (onlyIdentifier)
        candidate.assumptions = [
          ...candidate.assumptions,
          "secondary-keyword-is-identifier",
        ];
      else {
        const { secondaryUnits: _, ...components } =
          candidate.components as StreetAddressComponents;
        const { secondaryUnits: __, ...sourceSpans } = candidate.sourceSpans;
        candidates.push({
          ...candidate,
          id: `${candidate.id}:secondary-identifier`,
          sourceSpans,
          components: { ...components, secondary: identifierReading.units[0] },
          assumptions: [
            ...candidate.assumptions,
            "secondary-keyword-is-identifier",
          ],
        });
      }
    }
    // Keep scanning: a later suffix may anchor another street boundary.
  }

  if (candidates.length) {
    if (!anchoredUnit || ambiguousUnit) {
      const literal = parseStreet(tail);
      if (literal)
        candidates.push(
          make("unit-keyword-as-street", tail, literal, [
            "unit-keyword-is-street",
          ]),
        );
    }
    // A keyword without a preceding street suffix can be part of the name.
    // Continue looking for a later suffix followed by a bare unit identifier.
    if (!weakUnit && anchoredUnit) return { candidates };
  }

  const bareUnitNeedsSuffix = candidates.length > 0 && !weakUnit;
  const permitsBareBoundary = (
    streetTokens: readonly AddressToken[],
    street: Street,
  ) => {
    if (!bareUnitNeedsSuffix) return true;
    const postLength = street.postDirectional
      ? directional(streetTokens, true)!.length
      : 0;
    // The competing keyword itself can also be a suffix, e.g. KEY. Only a
    // suffix after it supports this additional street-name interpretation.
    return (
      !!street.streetSuffix &&
      streetTokens.length - postLength - 1 > firstUnanchoredKeyword
    );
  };
  const final = tail[tail.length - 1];
  // Two or three bare identifier tokens following an anchored street suffix.
  // Keep the usual final-token and literal readings alongside this boundary.
  for (let count = 2; count <= 3 && count < tail.length; count += 1) {
    const unitTokens = tail.slice(-count);
    if (
      !unitTokens.every(
        (token) =>
          /^[A-Z0-9]+(?:[-/][A-Z0-9]+)*$/.test(token.normalized) &&
          !UNIT_DESIGNATORS[token.normalized],
      ) ||
      !unitTokens.some((token) => /\d/.test(token.normalized)) ||
      DIRECTIONALS[unitTokens[0].normalized]
    )
      continue;
    const streetTokens = tail.slice(0, -count);
    const street = parseStreet(streetTokens);
    if (!street?.streetSuffix || !permitsBareBoundary(streetTokens, street))
      continue;
    const unit = make(
      `trailing-tokens-as-unit:${count}`,
      streetTokens,
      street,
      ["trailing-tokens-are-unit"],
    );
    unit.components = {
      ...(unit.components as StreetAddressComponents),
      secondary: { number: words(unitTokens) },
    };
    unit.sourceSpans.secondary = span(
      unitTokens[0],
      unitTokens[unitTokens.length - 1],
    );
    candidates.push(unit);
  }
  const unitShape =
    final &&
    (/^(?=.*\d)[A-Z0-9]+(?:[-/.][A-Z0-9]+)*$/.test(final.normalized) ||
      /^[A-Z]{1,3}(?:[-/][A-Z]{1,3})+$/.test(final.normalized) ||
      /^[A-Z]{1,3}$/.test(final.normalized));
  if (tail.length >= 2 && unitShape && !STREET_SUFFIXES.has(final.normalized)) {
    const streetTokens = tail.slice(0, -1);
    const street = parseStreet(streetTokens);
    if (
      street &&
      permitsBareBoundary(streetTokens, street) &&
      (street.streetSuffix ||
        /\d/.test(final.normalized) ||
        final.normalized.length === 1 ||
        final.normalized === "PH")
    ) {
      const unit = make("trailing-token-as-unit", streetTokens, street, [
        "trailing-token-is-unit",
      ]);
      unit.components = {
        ...(unit.components as StreetAddressComponents),
        secondary: { number: final.normalized },
      };
      unit.sourceSpans.secondary = span(final);
      const literal = parseStreet(tail, false, true)!;
      const primary = parseStreet(tail)!;
      const streetCandidate = make("trailing-token-as-street", tail, literal, [
        "trailing-token-is-street",
      ]);
      const alternatives = street.streetSuffix
        ? [unit, streetCandidate]
        : [streetCandidate, unit];
      if (primary.postDirectional)
        alternatives.unshift(make("literal", tail, primary));
      return { candidates: [...alternatives, ...candidates] };
    }
  }

  const street = parseStreet(tail);
  if (street) candidates.push(make("literal", tail, street));
  return { candidates };
}

export function streetCandidates(
  tokens: readonly AddressToken[],
  house: House,
): StreetResult {
  const result = primaryStreetCandidates(tokens, house);
  // Consider the first explicit floor marker only. Its prefix contains no
  // earlier eligible marker, so this recovery cannot recursively branch.
  const floorIndex = tokens.findIndex(
    (token, index) =>
      index > house.length && UNIT_DESIGNATORS[token.normalized] === "FL",
  );
  if (floorIndex < 0 || floorIndex === tokens.length - 1) return result;
  const prefixEnd =
    tokens[floorIndex - 1].normalized === "-" ? floorIndex - 1 : floorIndex;
  const preceding = tokens[prefixEnd - 1]?.normalized ?? "";
  // "2nd Floor Rear" and "Ground Floor" describe the floor itself. Do not
  // relabel that phrase as a bare unit followed by a different floor.
  if (
    FLOOR_ORDINALS[preceding] ||
    /(?:^|[-/])\d+(?:ST|ND|RD|TH)$/.test(preceding) ||
    (["ST", "ND", "RD", "TH"].includes(preceding) &&
      /^\d+$/.test(tokens[prefixEnd - 2]?.normalized ?? "")) ||
    ["GROUND", "MEZZANINE"].includes(preceding)
  )
    return result;
  const continuation = parseSecondaries(tokens.slice(floorIndex));
  // Keep prose such as "Floor Plan" out of this recovery. Other floor formats
  // retain their primary readings until supported by a separate grammar rule.
  if (
    !continuation ||
    !/^(?:-?\d+(?:\.\d+)?[A-Z]?|[A-Z]\d+)$/.test(
      continuation.units[0].number ?? "",
    )
  )
    return result;
  const prefix = primaryStreetCandidates(tokens.slice(0, prefixEnd), house);
  // A known street suffix and a bare secondary are required. Explicit units
  // such as BLDG FLOOR 2 must retain their existing identifier interpretation.
  if (
    !prefix.candidates.some((candidate) => {
      const c = candidate.components as StreetAddressComponents;
      return (
        c.streetSuffix && c.secondary?.number && !c.secondary.designator &&
        !DIRECTIONALS[c.secondary.number]
      );
    })
  )
    return result;
  const recovered = prefix.candidates.map((candidate) =>
    appendSecondaryChain(
      candidate,
      continuation.units,
      continuation.ranges,
      "explicit-floor",
    ),
  );
  return { candidates: [...result.candidates, ...recovered] };
}

/** Directional words can also be part of registered street names. */
/** Alternative assignments of observed tokens to street fields, never spelling guesses. */
export function streetBoundaryAlternatives(
  candidate: AddressCandidate,
  tokens: readonly AddressToken[],
): AddressCandidate[] {
  const streetSpan = candidate.sourceSpans.street;
  if (!streetSpan || candidate.components.kind) return [];
  const streetTokens = tokens.filter(
    (token) => token.start >= streetSpan.start && token.end <= streetSpan.end,
  );
  const original = candidate.components as StreetAddressComponents;
  const alternatives: AddressCandidate[] = [];
  const add = (id: string, components: StreetAddressComponents) =>
    alternatives.push({
      ...candidate,
      id: `${candidate.id}:${id}`,
      components,
      assumptions: [...candidate.assumptions, id],
    });
  const pre = directional(streetTokens);
  if (original.preDirectional && pre) {
    const consumed = pre.value === original.preDirectional ? pre.length : 1;
    if (consumed === 2)
      add("second-directional-is-street-name", {
        ...original,
        preDirectional: DIRECTIONALS[streetTokens[0].normalized],
        streetName: `${streetTokens[1].normalized} ${original.streetName}`,
      });
    if (streetTokens[0].normalized.length > 2) {
      const { preDirectional: _, ...rest } = original;
      add("leading-directional-is-street-name", {
        ...rest,
        streetName: `${words(streetTokens.slice(0, consumed))} ${original.streetName}`,
      });
    }
  }
  if (
    !original.postDirectional &&
    !original.streetSuffix &&
    streetTokens.length > 1
  ) {
    const extracted = parseStreet(streetTokens, true);
    if (extracted?.postDirectional)
      add("trailing-directional-is-postdirectional", {
        ...original,
        ...extracted,
      });
  }
  if (
    !original.preDirectional &&
    original.streetSuffix &&
    pre &&
    streetTokens.length - (original.postDirectional ? 1 : 0) === pre.length + 1
  ) {
    const { streetSuffix: _, ...rest } = original;
    add("suffix-is-street-name", {
      ...rest,
      preDirectional: pre.value,
      streetName: streetTokens[pre.length].normalized,
    });
  }
  return alternatives;
}
