import type { AddressCandidate, StreetAddressComponents } from "./types";
import { STATE_ABBREVIATIONS, STATE_NAMES } from "./vocabulary";
import { streetSpellings } from "./name-spelling";

// USPS Publication 28 Appendix F. These are lookup alternatives because a
// registered street name can deliberately contain an abbreviation.
const routeStarts = new Set([
  "C",
  "S",
  "F",
  "CO",
  "CNTY",
  "CR",
  "SR",
  "TSR",
  "US",
  "HWY",
  "HIWAY",
  "HIGHWAY",
  "RT",
  "RTE",
  "ROUTE",
  "ROAD",
  "RD",
  "I",
  "IH",
  "INTERSTATE",
  "ST",
  "STATE",
  "COUNTY",
  "TOWNSHIP",
  "RANCH",
  "FARM",
  "FM",
  ...STATE_ABBREVIATIONS,
  ...Object.keys(STATE_NAMES).map((name) => name.split(" ")[0]),
]);
function routeName(name: string): string {
  if (name.startsWith("OLD ")) return `OLD ${routeName(name.slice(4))}`;
  // Ordinary names cannot enter any route rule. Avoid state-name slicing and
  // route replacements on this common path, including numeric street names.
  const start = name.match(/^[A-Z]+/)?.[0];
  if (!start || !routeStarts.has(start)) return name;
  name = name
    .replace(/^(C R|S R|F M)(?= \d)/, (value) => value.replaceAll(" ", ""))
    .replace(/^FARM[ -]TO[ -]MARKET (?=\d)/, "FM ")
    .replace(/^(?:HWY|HIGHWAY) FM (?=\d)/, "FM ")
    .replace(
      /^([A-Z]{2})-?(\d[A-Z0-9/-]*)(?= |$)/,
      (value, code: string, id: string) =>
        STATE_ABBREVIATIONS.has(code) ? `${code} ${id}` : value,
    );
  const stateParts = name.split(" ");
  for (const length of [3, 2, 1]) {
    const code = STATE_NAMES[stateParts.slice(0, length).join(" ")];
    if (code && /^(?:\d|HWY$|HIGHWAY$|STATE$)/.test(stateParts[length] ?? "")) {
      name = [code, ...stateParts.slice(length)].join(" ");
      break;
    }
  }
  name = name.replace(/^([A-Z]{2}) (?=\d)/, (value, code: string) =>
    STATE_ABBREVIATIONS.has(code) && code !== "FM" ? `${code} HIGHWAY ` : value,
  );
  const compactPrefixes: Readonly<Record<string, string>> = {
    CR: "COUNTY ROAD",
    SR: "STATE ROAD",
    US: "US HIGHWAY",
    HWY: "HIGHWAY",
    RT: "ROUTE",
    RTE: "ROUTE",
    I: "INTERSTATE",
    IH: "INTERSTATE",
  };
  const separated = name.replace(
    /^(CR|SR|US|HWY|RTE?|IH|I)[- ]?(\d[A-Z0-9/-]*)(?= |$)/,
    (_, prefix: string, identifier: string) =>
      `${compactPrefixes[prefix]} ${identifier}`,
  );
  const identifier = /^(?:(?=.*\d)[A-Z0-9]+(?:[-/.][A-Z0-9]+)*|[A-Z]{1,2})$/;
  const originalParts = separated.split(" ");
  if (!originalParts.slice(1, 3).some((part) => identifier.test(part)))
    return name;
  let value = separated
    .replace(/^(CO|CNTY) (?=(?:RD|ROAD|HWY|HIGHWAY) )/, "COUNTY ")
    .replace(/^ST (?=(?:RD|ROAD|HWY|HIGHWAY|RT|RTE|ROUTE) )/, "STATE ")
    .replace(
      /^CR (?=(?:[A-Z]{1,2}|[A-Z0-9]*\d[A-Z0-9/-]*)(?: |$))/,
      "COUNTY ROAD ",
    )
    .replace(/^SR (?=\d)/, "STATE ROAD ")
    .replace(/^SR (?=[A-Z]{1,2}$)/, "STATE ROUTE ")
    .replace(/^TSR (?=\d)/, "TOWNSHIP ROAD ");
  value = value.replace(/^INTERSTATE (?:HWY|HIGHWAY) /, "INTERSTATE ");
  const parts = value.split(" ");
  let at = 0;
  if (
    ["US", "STATE", "COUNTY", "TOWNSHIP", "RANCH"].includes(parts[0]) ||
    STATE_ABBREVIATIONS.has(parts[0])
  )
    at = 1;
  const expanded: Readonly<Record<string, string>> = {
    RD: "ROAD",
    HWY: "HIGHWAY",
    HIWAY: "HIGHWAY",
    RT: "ROUTE",
    RTE: "ROUTE",
  };
  if (expanded[parts[at]] && identifier.test(parts[at + 1] ?? ""))
    parts[at] = expanded[parts[at]];
  value = parts.join(" ");
  return value;
}

/** Common route spellings are alternatives, not a preferred registered name. */
function abbreviatedRoute(name: string): string | undefined {
  const match = name.match(
    /^(COUNTY ROAD|STATE ROAD|STATE ROUTE|US HIGHWAY|HIGHWAY|ROUTE|TOWNSHIP ROAD) (\d[A-Z0-9/-]*|[A-Z]{1,2})$/,
  );
  if (!match) return undefined;
  const prefixes: Readonly<Record<string, string>> = {
    "COUNTY ROAD": "CR",
    "STATE ROAD": "SR",
    "STATE ROUTE": "SR",
    "US HIGHWAY": "US",
    HIGHWAY: "HWY",
    ROUTE: "RT",
    "TOWNSHIP ROAD": "TSR",
  };
  return `${prefixes[match[1]]} ${match[2]}`;
}

type Spelling = { name: string; assumption: string };
export type StreetSpellingExpander = (
  candidates: readonly AddressCandidate[],
  emit: (candidate: AddressCandidate) => void,
) => void;

/** Per-interpretation memoization never retains user addresses across calls. */
export function createStreetSpellingExpander(): StreetSpellingExpander {
  const routes = new Map<string, readonly Spelling[]>();
  const names = new Map<string, readonly Spelling[]>();
  return (candidates, emit) => {
    const withRoutes = [...candidates];
    const add = (base: AddressCandidate, spelling: Spelling) => {
      const components = base.components as StreetAddressComponents;
      const result = {
        ...base,
        id: `${base.id}:${spelling.assumption}`,
        components: { ...components, streetName: spelling.name },
        assumptions: [...base.assumptions, spelling.assumption],
      };
      emit(result);
      return result;
    };
    for (const base of candidates) {
      const components = base.components as StreetAddressComponents;
      let spellings = routes.get(components.streetName);
      if (!spellings) {
        const route = routeName(components.streetName);
        const abbreviated = abbreviatedRoute(components.streetName);
        spellings = [
          ...(route !== components.streetName
            ? [{ name: route, assumption: "route-name-expanded" }]
            : []),
          ...(abbreviated
            ? [{ name: abbreviated, assumption: "route-name-abbreviated" }]
            : []),
        ];
        routes.set(components.streetName, spellings);
      }
      for (const spelling of spellings) withRoutes.push(add(base, spelling));
    }
    for (const base of withRoutes) {
      const components = base.components as StreetAddressComponents;
      const hasSuffix = !!components.streetSuffix;
      const wordAlternatives =
        !base.assumptions.includes("trailing-token-is-street") &&
        components.streetName !== "PR" &&
        !/^VIA(?: |$)/.test(components.streetName);
      const key = `${+hasSuffix}${+wordAlternatives}:${components.streetName}`;
      let spellings = names.get(key);
      if (!spellings) {
        spellings = streetSpellings(
          components.streetName,
          hasSuffix,
          wordAlternatives,
        );
        names.set(key, spellings);
      }
      for (const spelling of spellings) add(base, spelling);
    }
  };
}
