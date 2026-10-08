import type {
  AddressCandidate,
  AddressToken,
  StreetAddressComponents,
} from "./types";
import { normalizeToken } from "./tokens";
import { STREET_SUFFIXES } from "./street-suffixes";
import { DIRECTIONALS, UNIT_DESIGNATORS } from "./vocabulary";
import type { StreetSpellingExpander } from "./spelling";
import { expandSecondaryForms } from "./secondary-format";

/** One additional token stream, never recursive or destructive to the original. */
export function repairFeedTokens(
  tokens: readonly AddressToken[],
  input: string,
) {
  const repaired = [...tokens];
  const assumptions: string[] = [];
  const first = repaired[0]?.normalized ?? "";
  const second = repaired[1]?.normalized ?? "";
  let house: string | undefined;
  let consumed = 1;
  if (/^\d+-$/.test(first) && /^\d+\/[1-9]\d*$/.test(second)) {
    house = `${first.slice(0, -1)} ${second}`;
    consumed = 2;
  } else if (
    /^\d+$/.test(first) &&
    second === "-" &&
    /^\d+\/[1-9]\d*$/.test(repaired[2]?.normalized ?? "")
  ) {
    house = `${first} ${repaired[2].normalized}`;
    consumed = 3;
  } else if (/^[NSEW]$/.test(first) && /^\d+$/.test(second)) {
    house = first + second;
    consumed = 2;
  } else if (
    /^\d+$/.test(first) &&
    second === "-" &&
    /^\d+$/.test(repaired[2]?.normalized ?? "")
  ) {
    house = `${first}-${repaired[2].normalized}`;
    consumed = 3;
  } else if (/^\d+$/.test(first) && /^-\d+$/.test(second)) {
    house = first + second;
    consumed = 2;
  } else if (/^\d+-$/.test(first) && /^\d+$/.test(second)) {
    house = first + second;
    consumed = 2;
  }
  if (house) {
    const start = repaired[0].start;
    const end = repaired[consumed - 1].end;
    repaired.splice(0, consumed, {
      raw: input.slice(start, end),
      normalized: house,
      start,
      end,
    });
    assumptions.push("house-number-spacing");
  }
  const fraction = repaired[0]?.normalized.match(/^(\d+)-(\d+\/[1-9]\d*)$/);
  if (fraction) {
    repaired[0] = {
      ...repaired[0],
      normalized: `${fraction[1]} ${fraction[2]}`,
    };
    assumptions.push("fractional-house-separator");
  }
  for (let index = 1; index <= 3 && index < repaired.length - 2; index++) {
    if (
      repaired[index].normalized.length !== 1 ||
      repaired[index + 1].normalized.length !== 1
    )
      continue;
    const pair = repaired[index].normalized + repaired[index + 1].normalized;
    if (
      ["CR", "SR", "FM"].includes(pair) &&
      /^\d/.test(repaired[index + 2].normalized) &&
      repaired.slice(1, index).every((token) => DIRECTIONALS[token.normalized])
    ) {
      const start = repaired[index].start,
        end = repaired[index + 1].end;
      repaired.splice(index, 2, {
        raw: input.slice(start, end),
        normalized: pair,
        start,
        end,
      });
      assumptions.push("route-prefix-spacing");
      break;
    }
  }
  // A suffix or secondary marker joined to digits, e.g. RD8 or APT4.
  // Retain the unmodified interpretation: ST4 may itself be a unit identifier.
  let joined = false;
  const split = repaired.flatMap((token, index) => {
    const marked =
      index > 0 &&
      token.raw.includes("-") &&
      token.raw.match(
        /^([A-Za-z]+\.?)-([A-Za-z0-9]+(?:[-/.][A-Za-z0-9]+)*[,;:.]*)$/,
      );
    if (marked && UNIT_DESIGNATORS[normalizeToken(marked[1])]) {
      joined = true;
      const boundary = token.start + marked[1].length + 1;
      return [
        {
          raw: token.raw.slice(0, marked[1].length + 1),
          normalized: normalizeToken(marked[1]),
          start: token.start,
          end: boundary,
        },
        {
          raw: marked[2],
          normalized: normalizeToken(marked[2]),
          start: boundary,
          end: token.end,
        },
      ];
    }
    // A numeric street can be joined to its suffix: 186ST or 42AVE. Only
    // consider the first name token, before any secondary phrase. 21ST can
    // also be an ordinal name, so the original stream remains available.
    const numbered =
      index > 0 &&
      index <= 3 &&
      token.raw.match(/^(\d{1,4})([A-Za-z]+\.?[,;:]*)$/);
    // In "1st Avenue" and "3rd Street", ST/RD belongs to the ordinal.
    // Splitting it would invent "1 ST" or "3 RD" as a different street name.
    // Without a separate suffix, "21ST" can still mean "21 ST" or "21st".
    const ordinal = numbered ? token.normalized.match(/^(\d+)(ST|ND|RD|TH)$/) : null;
    const value = ordinal ? Number(ordinal[1]) : 0;
    const ordinalEnding = value % 100 >= 11 && value % 100 <= 13
      ? "TH"
      : ({ 1: "ST", 2: "ND", 3: "RD" } as Record<number, string>)[value % 10] ?? "TH";
    const hasOrdinalAndSuffix = ordinal?.[2] === ordinalEnding &&
      STREET_SUFFIXES.has(repaired[index + 1]?.normalized ?? "");
    if (
      numbered &&
      !hasOrdinalAndSuffix &&
      STREET_SUFFIXES.has(normalizeToken(numbered[2])) &&
      repaired.slice(1, index).every((part) => DIRECTIONALS[part.normalized])
    ) {
      joined = true;
      const boundary = token.start + numbered[1].length;
      return [
        {
          raw: numbered[1],
          normalized: numbered[1],
          start: token.start,
          end: boundary,
        },
        {
          raw: numbered[2],
          normalized: normalizeToken(numbered[2]),
          start: boundary,
          end: token.end,
        },
      ];
    }
    const match =
      index > 0 && token.raw.match(/^([A-Za-z]+\.?)(\d[A-Za-z0-9/-]*[,;:]*)$/);
    if (
      !match ||
      !(
        STREET_SUFFIXES.has(normalizeToken(match[1])) ||
        UNIT_DESIGNATORS[normalizeToken(match[1])]
      )
    )
      return [token];
    joined = true;
    const boundary = token.start + match[1].length;
    return [
      {
        raw: match[1],
        normalized: normalizeToken(match[1]),
        start: token.start,
        end: boundary,
      },
      {
        raw: match[2],
        normalized: normalizeToken(match[2]),
        start: boundary,
        end: token.end,
      },
    ];
  });
  if (joined) assumptions.push("joined-address-components");
  for (let index = 2; index < split.length - 1; index++) {
    if (
      split[index].normalized === "--" &&
      /^[A-Z0-9]+(?:[-/][A-Z0-9]+)*$/.test(split[index + 1].normalized)
    ) {
      split[index] = { ...split[index], normalized: "UNIT" };
      assumptions.push("secondary-separator-inferred");
    }
  }
  return assumptions.length ? { tokens: split, assumptions } : undefined;
}

export function feedFormatAlternatives(
  candidate: AddressCandidate,
  tokens: readonly AddressToken[],
  spellings: StreetSpellingExpander | undefined,
  emit: (candidate: AddressCandidate) => void,
): void {
  if (candidate.components.kind) return;
  const original = candidate.components as StreetAddressComponents;
  const results: AddressCandidate[] = [candidate];
  const add = (
    base: AddressCandidate,
    assumption: string,
    components: StreetAddressComponents,
    sourceSpans: AddressCandidate["sourceSpans"] = base.sourceSpans,
  ) => {
    if (!/[\p{L}\p{N}]/u.test(components.streetName)) return;
    const result: AddressCandidate = {
      ...base,
      id: `${base.id}:${assumption}`,
      components,
      sourceSpans,
      assumptions: [...base.assumptions, assumption],
    };
    results.push(result);
    emit(result);
  };
  const parts = original.streetName.split(" ");
  if (parts.length > 1 && parts[0] === original.houseNumber) {
    const repeatedPre =
      original.preDirectional &&
      DIRECTIONALS[parts[1]] === original.preDirectional;
    const rest = parts.slice(repeatedPre ? 2 : 1);
    if (rest.length && (original.streetSuffix || repeatedPre))
      add(candidate, "repeated-house-number-before-street-name", {
        ...original,
        streetName: rest.join(" "),
      });
  }
  if (
    original.preDirectional &&
    original.preDirectional === original.postDirectional
  ) {
    const { preDirectional: _, ...postOnly } = original;
    const { postDirectional: __, ...preOnly } = original;
    add(candidate, "repeated-directional-is-postdirectional", postOnly);
    add(candidate, "repeated-directional-is-predirectional", preOnly);
  }
  if (
    parts.length > 1 &&
    original.preDirectional &&
    DIRECTIONALS[parts[0]] === original.preDirectional
  )
    add(candidate, "repeated-predirectional", {
      ...original,
      streetName: parts.slice(1).join(" "),
    });
  if (
    original.streetSuffix &&
    ["HWY", "RD", "RTE"].includes(original.streetSuffix)
  ) {
    const route = original.streetName.match(
      /^(?:(US|STATE|COUNTY|TOWNSHIP|RANCH) )?((?:\d[A-Z0-9/-]*|[A-Z]{1,3}\d[A-Z0-9/-]*|[A-Z]{1,2}))(?: (US|STATE|COUNTY))?$/,
    );
    if (route && !(route[1] && route[3])) {
      const { streetSuffix: _, ...components } = original;
      const type = (
        { HWY: "HIGHWAY", RD: "ROAD", RTE: "ROUTE" } as Record<string, string>
      )[original.streetSuffix];
      add(candidate, "route-name-order", {
        ...components,
        streetName: `${route[1] || route[3] ? (route[1] || route[3]) + " " : ""}${type} ${route[2]}`,
      });
    }
  }
  // MLS feeds sometimes place a short unit identifier before the street or
  // before its suffix. Preserve every identifier and the literal street reading.
  if (original.streetSuffix && parts.length > 1 && !original.secondaryUnits) {
    const streetTokens = tokens.filter(
      (t) =>
        t.start >= (candidate.sourceSpans.street?.start ?? Infinity) &&
        t.end <= (candidate.sourceSpans.street?.end ?? -1),
    );
    const start = streetTokens.findIndex(
      (_, index) =>
        streetTokens
          .slice(index, index + parts.length)
          .map((t) => t.normalized)
          .join(" ") === original.streetName,
    );
    if (start >= 0) {
      for (const at of [0, parts.length - 2]) {
        const designator = UNIT_DESIGNATORS[parts[at]];
        const identifier = parts[at + 1];
        if (
          parts.length < 3 ||
          !["APT", "UNIT", "STE", "BLDG", "LOT", "PH"].includes(designator) ||
          !/^[A-Z0-9]+(?:[-/.][A-Z0-9]+)*$/.test(identifier) ||
          (original.secondary && original.secondary.number !== identifier)
        )
          continue;
        add(
          candidate,
          "secondary-phrase-before-street-suffix",
          {
            ...original,
            streetName: parts
              .filter((_, index) => index !== at && index !== at + 1)
              .join(" "),
            secondary: original.secondary ?? { designator, number: identifier },
          },
          original.secondary
            ? candidate.sourceSpans
            : {
                ...candidate.sourceSpans,
                secondary: {
                  start: streetTokens[start + at].start,
                  end: streetTokens[start + at + 1].end,
                },
              },
        );
      }
      for (const at of [0, parts.length - 1]) {
        const identifier = parts[at];
        if (
          !/^(?:[A-Z]|[A-Z]{1,3}\d+[A-Z]?|\d+[A-Z]{1,3})$/.test(identifier) ||
          (original.secondary && original.secondary.number !== identifier)
        )
          continue;
        const token = streetTokens[start + at];
        const next = {
          ...original,
          streetName: parts.filter((_, i) => i !== at).join(" "),
          secondary: original.secondary ?? { number: identifier },
        };
        add(
          candidate,
          original.secondary
            ? "repeated-secondary-identifier"
            : "secondary-before-street-suffix",
          next,
          original.secondary
            ? candidate.sourceSpans
            : {
                ...candidate.sourceSpans,
                secondary: { start: token.start, end: token.end },
              },
        );
      }
    }
  }
  // A duplicated postdirectional can remain at the end of a suffixless name or
  // be read as a bare unit after a suffix. An explicit unit is never discarded.
  if (original.postDirectional) {
    for (let at = 0, count = results.length; at < count; at++) {
      const base = results[at];
      const components = base.components as StreetAddressComponents;
      if (!components.postDirectional) continue;
      const name = components.streetName.split(" ");
      const previousLength = name.length;
      while (
        name.length > 1 &&
        DIRECTIONALS[name[name.length - 1]] === components.postDirectional
      )
        name.pop();
      if (name.length !== previousLength) {
        add(base, "repeated-postdirectional-in-street-name", {
          ...components,
          streetName: name.join(" "),
        });
        const suffix =
          !components.streetSuffix && name.length > 1
            ? STREET_SUFFIXES.get(name[name.length - 1])
            : undefined;
        if (suffix)
          add(base, "repeated-postdirectional-reveals-suffix", {
            ...components,
            streetName: name.slice(0, -1).join(" "),
            streetSuffix: suffix,
          });
      }
    }
    for (let at = 0, count = results.length; at < count; at++) {
      const base = results[at];
      const components = base.components as StreetAddressComponents;
      if (
        components.postDirectional &&
        components.secondary?.number &&
        !components.secondary.designator &&
        !components.secondaryUnits &&
        DIRECTIONALS[components.secondary.number] === components.postDirectional
      ) {
        const { secondary: _, ...rest } = components;
        add(base, "repeated-postdirectional-is-not-unit", rest);
      }
    }
  }
  // Compose this repair with earlier duplicate-direction/house and secondary
  // interpretations. Every earlier reading remains available; this is one
  // bounded pass over existing structures, not recursive rule application.
  for (let at = 0, count = results.length; at < count; at++) {
    const base = results[at];
    const components = base.components as StreetAddressComponents;
    if (!components.streetSuffix) continue;
    const name = components.streetName.split(" ");
    const previousLength = name.length;
    while (
      name.length > 1 &&
      STREET_SUFFIXES.get(name[name.length - 1]) === components.streetSuffix
    )
      name.pop();
    if (name.length !== previousLength)
      add(base, "repeated-street-suffix", {
        ...components,
        streetName: name.join(" "),
      });
  }
  // Spelling expansion is a separate, optional phase. Structural repairs above
  // remain available when callers only want observed street-name spellings.
  spellings?.(results.slice(), (alternative) => {
    results.push(alternative);
    emit(alternative);
  });
  expandSecondaryForms(candidate, results, tokens, !!spellings, emit);
}
