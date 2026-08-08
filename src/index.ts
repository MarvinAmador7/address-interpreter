export interface AddressInput {
  deliveryLine: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

export interface SecondaryAddress {
  designator?: string;
  number?: string;
}

export interface AddressComponents {
  houseNumber: string;
  preDirectional?: string;
  streetName: string;
  streetSuffix?: string;
  postDirectional?: string;
  secondary?: SecondaryAddress;
  city?: string;
  state?: string;
  postalCode?: string;
}

export interface AddressCandidate {
  id: string;
  components: AddressComponents;
  assumptions: readonly string[];
  sourceSpans: AddressCandidateSourceSpans;
}

export interface SourceSpan {
  start: number;
  end: number;
}

export interface AddressCandidateSourceSpans {
  houseNumber: SourceSpan;
  street: SourceSpan;
  secondary?: SourceSpan;
  city?: SourceSpan;
  state?: SourceSpan;
  postalCode?: SourceSpan;
}

export interface AddressToken {
  raw: string;
  normalized: string;
  start: number;
  end: number;
}

export interface AddressInterpretation {
  tokens: readonly AddressToken[];
  candidates: readonly AddressCandidate[];
  diagnostics: readonly AddressDiagnostic[];
}

export type AddressDiagnostic =
  | "missing-house-number"
  | "unrecognized-delivery-line";

export interface AddressMatch<T> {
  candidateId: string;
  entityId: string;
  value: T;
}

export interface AddressIndex<T> {
  lookupCandidates(
    candidates: readonly AddressCandidate[],
  ): Promise<readonly AddressMatch<T>[]>;
}

export type AddressResolution<T> =
  | {
      status: "resolved";
      interpretation: AddressInterpretation;
      match: AddressMatch<T>;
    }
  | {
      status: "ambiguous";
      interpretation: AddressInterpretation;
      matches: readonly AddressMatch<T>[];
    }
  | {
      status: "not-found";
      interpretation: AddressInterpretation;
    }
  | {
      status: "invalid";
      interpretation: AddressInterpretation;
    };

export interface AddressResolver<T> {
  resolve(input: AddressInput): Promise<AddressResolution<T>>;
}

export interface FullAddressResolver<T> {
  resolve(fullAddress: string): Promise<AddressResolution<T>>;
}

const STREET_SUFFIXES: Readonly<Record<string, string>> = {
  ALLEE: "ALY",
  ALLEY: "ALY",
  ALLY: "ALY",
  ALY: "ALY",
  ANEX: "ANX",
  ANNEX: "ANX",
  ANNX: "ANX",
  ANX: "ANX",
  AVE: "AVE",
  AVENUE: "AVE",
  BAYOO: "BYU",
  BAYOU: "BYU",
  BEND: "BND",
  BND: "BND",
  BOT: "BTM",
  BOTTOM: "BTM",
  BOTTM: "BTM",
  BLVD: "BLVD",
  BOULEVARD: "BLVD",
  BTM: "BTM",
  CARR: "CARR",
  CAUSEWAY: "CSWY",
  CAUSWA: "CSWY",
  CIR: "CIR",
  CIRCLE: "CIR",
  COURT: "CT",
  COVE: "CV",
  CRK: "CRK",
  CREEK: "CRK",
  CRES: "CRES",
  CRESCENT: "CRES",
  CROSSING: "XING",
  CRSENT: "CRES",
  CRSNT: "CRES",
  CSWY: "CSWY",
  CT: "CT",
  CV: "CV",
  DR: "DR",
  DRIVE: "DR",
  EXP: "EXPY",
  EXPRESS: "EXPY",
  EXPRESSWAY: "EXPY",
  EXPR: "EXPY",
  EXPW: "EXPY",
  EXPY: "EXPY",
  FREEWAY: "FWY",
  FREEWY: "FWY",
  FRWAY: "FWY",
  FRWY: "FWY",
  FWY: "FWY",
  GLEN: "GLN",
  GLN: "GLN",
  GROVE: "GRV",
  GRV: "GRV",
  HEIGHTS: "HTS",
  HIGHWAY: "HWY",
  HILL: "HL",
  HL: "HL",
  HTS: "HTS",
  HWY: "HWY",
  JCT: "JCT",
  JCTION: "JCT",
  JCTN: "JCT",
  JUNCTION: "JCT",
  JUNCTN: "JCT",
  JUNCTON: "JCT",
  LANDING: "LNDG",
  LANE: "LN",
  LNDG: "LNDG",
  LN: "LN",
  LOOP: "LOOP",
  MNTAIN: "MTN",
  MNTN: "MTN",
  MOUNTAIN: "MTN",
  MOUNTIN: "MTN",
  MTIN: "MTN",
  MTN: "MTN",
  PARK: "PARK",
  PARKWAY: "PKWY",
  PASS: "PASS",
  PATH: "PATH",
  PIKE: "PIKE",
  PKWY: "PKWY",
  PL: "PL",
  PLACE: "PL",
  PLAZA: "PLZ",
  PLZ: "PLZ",
  PLZA: "PLZ",
  POINT: "PT",
  PT: "PT",
  RD: "RD",
  RDG: "RDG",
  RDGE: "RDG",
  RIDGE: "RDG",
  ROAD: "RD",
  ROW: "ROW",
  ROUTE: "RTE",
  RTE: "RTE",
  RUN: "RUN",
  SQ: "SQ",
  SQR: "SQ",
  SQRE: "SQ",
  SQU: "SQ",
  SQUARE: "SQ",
  SPUR: "SPUR",
  STA: "STA",
  ST: "ST",
  STATION: "STA",
  STATN: "STA",
  STN: "STA",
  STREET: "ST",
  TER: "TER",
  TERRACE: "TER",
  TPKE: "TPKE",
  TRACE: "TRCE",
  TRAIL: "TRL",
  TRCE: "TRCE",
  TRL: "TRL",
  TURNPIKE: "TPKE",
  VDCT: "VIA",
  VIA: "VIA",
  VIADCT: "VIA",
  VIADUCT: "VIA",
  VIS: "VIS",
  VIST: "VIS",
  VISTA: "VIS",
  VST: "VIS",
  VSTA: "VIS",
  VIEW: "VW",
  VW: "VW",
  WALK: "WALK",
  WAY: "WAY",
  WELL: "WL",
  WELLS: "WLS",
  WL: "WL",
  WLS: "WLS",
  XING: "XING",
};

const UNIT_DESIGNATORS: Readonly<Record<string, string>> = {
  "#": "#",
  APARTMENT: "APT",
  APT: "APT",
  BLDG: "BLDG",
  BASEMENT: "BSMT",
  BSMT: "BSMT",
  BUILDING: "BLDG",
  DEPARTMENT: "DEPT",
  DEPT: "DEPT",
  FL: "FL",
  FLOOR: "FL",
  FRNT: "FRNT",
  FRONT: "FRNT",
  HANGAR: "HNGR",
  HANGER: "HNGR",
  HNGR: "HNGR",
  KEY: "KEY",
  LBBY: "LBBY",
  LOBBY: "LBBY",
  LOT: "LOT",
  LOWER: "LOWR",
  LOWR: "LOWR",
  OFC: "OFC",
  OFFICE: "OFC",
  PENTHOUSE: "PH",
  PH: "PH",
  PIER: "PIER",
  REAR: "REAR",
  RM: "RM",
  ROOM: "RM",
  SIDE: "SIDE",
  SLIP: "SLIP",
  SPACE: "SPC",
  SPC: "SPC",
  STE: "STE",
  STOP: "STOP",
  SUITE: "STE",
  TRAILER: "TRLR",
  TRLR: "TRLR",
  UNIT: "UNIT",
  UPPER: "UPPR",
  UPPR: "UPPR",
};

const UNIT_DESIGNATORS_WITHOUT_NUMBER = new Set([
  "BSMT",
  "FRNT",
  "LBBY",
  "LOWR",
  "OFC",
  "PH",
  "REAR",
  "SIDE",
  "UPPR",
]);

const DIRECTIONALS: Readonly<Record<string, string>> = {
  E: "E",
  EAST: "E",
  N: "N",
  NE: "NE",
  NORTHEAST: "NE",
  NORTH: "N",
  NORTHWEST: "NW",
  NW: "NW",
  S: "S",
  SE: "SE",
  SOUTH: "S",
  SOUTHEAST: "SE",
  SOUTHWEST: "SW",
  SW: "SW",
  W: "W",
  WEST: "W",
};

const STATE_ABBREVIATIONS = new Set([
  "AA",
  "AE",
  "AK",
  "AL",
  "AP",
  "AR",
  "AS",
  "AZ",
  "CA",
  "CO",
  "CT",
  "DC",
  "DE",
  "FL",
  "FM",
  "GA",
  "GU",
  "HI",
  "IA",
  "ID",
  "IL",
  "IN",
  "KS",
  "KY",
  "LA",
  "MA",
  "MD",
  "ME",
  "MH",
  "MI",
  "MN",
  "MO",
  "MP",
  "MS",
  "MT",
  "NC",
  "ND",
  "NE",
  "NH",
  "NJ",
  "NM",
  "NV",
  "NY",
  "OH",
  "OK",
  "OR",
  "PA",
  "PR",
  "PW",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VA",
  "VI",
  "VT",
  "WA",
  "WI",
  "WV",
  "WY",
]);

const STATE_NAMES: Readonly<Record<string, string>> = {
  ALABAMA: "AL",
  ALASKA: "AK",
  "AMERICAN SAMOA": "AS",
  ARIZONA: "AZ",
  ARKANSAS: "AR",
  CALIFORNIA: "CA",
  COLORADO: "CO",
  CONNECTICUT: "CT",
  DELAWARE: "DE",
  "DISTRICT OF COLUMBIA": "DC",
  FLORIDA: "FL",
  "FEDERATED STATES OF MICRONESIA": "FM",
  GEORGIA: "GA",
  GUAM: "GU",
  HAWAII: "HI",
  IDAHO: "ID",
  ILLINOIS: "IL",
  INDIANA: "IN",
  IOWA: "IA",
  KANSAS: "KS",
  KENTUCKY: "KY",
  LOUISIANA: "LA",
  MAINE: "ME",
  "MARSHALL ISLANDS": "MH",
  MARYLAND: "MD",
  MASSACHUSETTS: "MA",
  MICHIGAN: "MI",
  MINNESOTA: "MN",
  MISSISSIPPI: "MS",
  MISSOURI: "MO",
  MONTANA: "MT",
  NEBRASKA: "NE",
  NEVADA: "NV",
  "NEW HAMPSHIRE": "NH",
  "NEW JERSEY": "NJ",
  "NEW MEXICO": "NM",
  "NEW YORK": "NY",
  "NORTH CAROLINA": "NC",
  "NORTH DAKOTA": "ND",
  "NORTHERN MARIANA ISLANDS": "MP",
  OHIO: "OH",
  OKLAHOMA: "OK",
  OREGON: "OR",
  PALAU: "PW",
  PENNSYLVANIA: "PA",
  "PUERTO RICO": "PR",
  "RHODE ISLAND": "RI",
  "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD",
  TENNESSEE: "TN",
  TEXAS: "TX",
  UTAH: "UT",
  VERMONT: "VT",
  "VIRGIN ISLANDS": "VI",
  VIRGINIA: "VA",
  WASHINGTON: "WA",
  "WEST VIRGINIA": "WV",
  WISCONSIN: "WI",
  WYOMING: "WY",
};

function tokenize(deliveryLine: string): AddressToken[] {
  return Array.from(deliveryLine.matchAll(/#|[^\s#]+/g), (match) => ({
    raw: match[0],
    normalized: normalizeToken(match[0]),
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function normalizeToken(raw: string): string {
  const upper = raw.toUpperCase();
  const withoutAbbreviationPeriods = /^[A-Z.]+$/.test(upper)
    ? upper.replaceAll(".", "")
    : upper;

  return withoutAbbreviationPeriods.replace(/^[,;:]+|[,;:.]+$/g, "");
}

function normalize(value: string | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized || undefined;
}

function span(first: AddressToken, last: AddressToken = first): SourceSpan {
  return { start: first.start, end: last.end };
}

interface TrailingState {
  start: number;
  end: number;
  abbreviation: string;
}

interface LocalityShape {
  localityEnd: number;
  state?: TrailingState;
  postalCodeIndex?: number;
}

function findTrailingState(
  tokens: readonly AddressToken[],
  end: number,
): TrailingState | undefined {
  const finalToken = tokens[end - 1];

  if (finalToken && STATE_ABBREVIATIONS.has(finalToken.normalized)) {
    return {
      start: end - 1,
      end,
      abbreviation: finalToken.normalized,
    };
  }

  for (let tokenCount = Math.min(4, end); tokenCount >= 1; tokenCount -= 1) {
    const start = end - tokenCount;
    const name = tokens
      .slice(start, end)
      .map((token) => token.normalized)
      .join(" ");
    const abbreviation = STATE_NAMES[name];

    if (abbreviation) {
      return { start, end, abbreviation };
    }
  }

  return undefined;
}

function hasLocalitySeparator(
  fullAddress: string,
  left: AddressToken,
  right: AddressToken,
): boolean {
  const separatorText = `${left.raw.slice(-1)}${fullAddress.slice(
    left.end,
    right.start,
  )}`;

  return /[,;:\n\r]/.test(separatorText);
}

function componentSpanId(componentSpan: SourceSpan | undefined): string {
  return componentSpan
    ? `${componentSpan.start}-${componentSpan.end}`
    : "none";
}

function addUniqueCandidate(
  candidates: AddressCandidate[],
  candidateKeys: Set<string>,
  candidate: AddressCandidate,
): void {
  const key = JSON.stringify({
    components: candidate.components,
    sourceSpans: candidate.sourceSpans,
  });

  if (!candidateKeys.has(key)) {
    candidateKeys.add(key);
    candidates.push(candidate);
  }
}

export function interpretAddress(input: AddressInput): AddressInterpretation {
  const tokens = tokenize(input.deliveryLine);

  if (!tokens[0] || !/\d/.test(tokens[0].normalized)) {
    return { tokens, candidates: [], diagnostics: ["missing-house-number"] };
  }

  let unitDesignator: string | undefined;
  let unitDesignatorIndex = -1;
  let suffixIndex = -1;
  let explicitPostDirectional: string | undefined;

  for (let index = 2; index < tokens.length; index += 1) {
    const possibleUnitDesignator = UNIT_DESIGNATORS[tokens[index].normalized];
    const possiblePostDirectional = DIRECTIONALS[tokens[index - 1].normalized];
    const possibleSuffixIndex = index - (possiblePostDirectional ? 2 : 1);

    if (
      possibleUnitDesignator &&
      (index < tokens.length - 1 ||
        UNIT_DESIGNATORS_WITHOUT_NUMBER.has(possibleUnitDesignator)) &&
      possibleSuffixIndex >= 2 &&
      STREET_SUFFIXES[tokens[possibleSuffixIndex]?.normalized]
    ) {
      unitDesignator = possibleUnitDesignator;
      unitDesignatorIndex = index;
      suffixIndex = possibleSuffixIndex;
      explicitPostDirectional = possiblePostDirectional;
      break;
    }
  }

  const streetSuffix = STREET_SUFFIXES[tokens[suffixIndex]?.normalized];
  const unitNumberTokens =
    unitDesignatorIndex >= 0 ? tokens.slice(unitDesignatorIndex + 1) : [];
  const unitNumber = unitNumberTokens
    .map((token) => token.normalized)
    .join(" ");
  const unitNumberRequired = unitDesignator
    ? !UNIT_DESIGNATORS_WITHOUT_NUMBER.has(unitDesignator)
    : false;

  if (unitDesignatorIndex === -1 && tokens.length >= 4) {
    const trailingToken = tokens[tokens.length - 1];
    const barePostDirectional =
      DIRECTIONALS[tokens[tokens.length - 2].normalized];
    const bareSuffixIndex =
      tokens.length - (barePostDirectional ? 3 : 2);
    const bareStreetSuffix = STREET_SUFFIXES[tokens[bareSuffixIndex].normalized];
    const barePreDirectional = DIRECTIONALS[tokens[1].normalized];
    const bareStreetNameStart = barePreDirectional ? 2 : 1;

    if (
      bareStreetSuffix &&
      bareStreetNameStart < bareSuffixIndex &&
      /^(?=.*\d)[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(trailingToken.normalized)
    ) {
      const houseNumber = tokens[0].normalized;
      const streetName = tokens
        .slice(bareStreetNameStart, bareSuffixIndex)
        .map((token) => token.normalized)
        .join(" ");
      const locality = {
        city: normalize(input.city),
        state: normalize(input.state),
        postalCode: normalize(input.postalCode),
      };

      return {
        tokens,
        diagnostics: [],
        candidates: [
          {
            id: "trailing-token-as-unit",
            assumptions: ["trailing-token-is-unit"],
            sourceSpans: {
              houseNumber: span(tokens[0]),
              street: span(tokens[1], tokens[tokens.length - 2]),
              secondary: span(trailingToken),
            },
            components: {
              houseNumber,
              ...(barePreDirectional
                ? { preDirectional: barePreDirectional }
                : {}),
              streetName,
              streetSuffix: bareStreetSuffix,
              ...(barePostDirectional
                ? { postDirectional: barePostDirectional }
                : {}),
              secondary: { number: trailingToken.normalized },
              ...locality,
            },
          },
          {
            id: "trailing-token-as-street",
            assumptions: ["trailing-token-is-street"],
            sourceSpans: {
              houseNumber: span(tokens[0]),
              street: span(tokens[1], trailingToken),
            },
            components: {
              houseNumber,
              ...(barePreDirectional
                ? { preDirectional: barePreDirectional }
                : {}),
              streetName: tokens
                .slice(bareStreetNameStart)
                .map((token) => token.normalized)
                .join(" "),
              ...locality,
            },
          },
        ],
      };
    }
  }

  if (unitDesignatorIndex === -1 && tokens.length >= 3) {
    const literalPostDirectional =
      DIRECTIONALS[tokens[tokens.length - 1].normalized];
    const literalSuffixIndex =
      tokens.length - (literalPostDirectional ? 2 : 1);
    const literalStreetSuffix =
      STREET_SUFFIXES[tokens[literalSuffixIndex].normalized];
    const possibleLiteralPreDirectional = DIRECTIONALS[tokens[1].normalized];
    const literalPreDirectional =
      possibleLiteralPreDirectional && literalSuffixIndex > 2
        ? possibleLiteralPreDirectional
        : undefined;
    const literalStreetNameStart = literalPreDirectional ? 2 : 1;

    if (literalStreetSuffix && literalStreetNameStart < literalSuffixIndex) {
      return {
        tokens,
        diagnostics: [],
        candidates: [
          {
            id: "literal",
            assumptions: [],
            sourceSpans: {
              houseNumber: span(tokens[0]),
              street: span(tokens[1], tokens[tokens.length - 1]),
            },
            components: {
              houseNumber: tokens[0].normalized,
              ...(literalPreDirectional
                ? { preDirectional: literalPreDirectional }
                : {}),
              streetName: tokens
                .slice(literalStreetNameStart, literalSuffixIndex)
                .map((token) => token.normalized)
                .join(" "),
              streetSuffix: literalStreetSuffix,
              ...(literalPostDirectional
                ? { postDirectional: literalPostDirectional }
                : {}),
              city: normalize(input.city),
              state: normalize(input.state),
              postalCode: normalize(input.postalCode),
            },
          },
        ],
      };
    }
  }

  if (unitDesignatorIndex === -1 && tokens.length >= 2) {
    const fallbackPreDirectional =
      tokens.length >= 3 ? DIRECTIONALS[tokens[1].normalized] : undefined;
    const fallbackPostDirectional =
      fallbackPreDirectional &&
      tokens.length === 4 &&
      /^\d+$/.test(tokens[2].normalized)
        ? DIRECTIONALS[tokens[3].normalized]
        : undefined;
    const fallbackStreetNameStart = fallbackPreDirectional ? 2 : 1;
    const fallbackStreetNameEnd = fallbackPostDirectional
      ? tokens.length - 1
      : tokens.length;

    const literalCandidate: AddressCandidate = {
      id: "literal",
      assumptions: [],
      sourceSpans: {
        houseNumber: span(tokens[0]),
        street: span(tokens[1], tokens[tokens.length - 1]),
      },
      components: {
        houseNumber: tokens[0].normalized,
        ...(fallbackPreDirectional
          ? { preDirectional: fallbackPreDirectional }
          : {}),
        streetName: tokens
          .slice(fallbackStreetNameStart, fallbackStreetNameEnd)
          .map((token) => token.normalized)
          .join(" "),
        ...(fallbackPostDirectional
          ? { postDirectional: fallbackPostDirectional }
          : {}),
        city: normalize(input.city),
        state: normalize(input.state),
        postalCode: normalize(input.postalCode),
      },
    };

    // No suffix anchors the street, but an explicit unit keyword still marks
    // everything after it as the unit. Both readings survive as candidates;
    // the keyword never has to be part of the street for the line to resolve,
    // and the index settles which reading exists. Designators that take no
    // number (FRNT, REAR, ...) only qualify at the end of the line: "Ocean
    // Front 5" is a street, not a numbered front unit.
    for (let index = 2; index < tokens.length; index += 1) {
      const keywordDesignator = UNIT_DESIGNATORS[tokens[index].normalized];
      if (!keywordDesignator) continue;

      const keywordNumberTokens = tokens.slice(index + 1);
      const keywordNumber = keywordNumberTokens
        .map((token) => token.normalized)
        .join(" ");

      if (UNIT_DESIGNATORS_WITHOUT_NUMBER.has(keywordDesignator)) {
        if (keywordNumberTokens.length > 0) continue;
      } else if (!keywordNumber) {
        continue;
      }

      const keywordPostDirectional =
        index > 2 ? DIRECTIONALS[tokens[index - 1].normalized] : undefined;
      const keywordStreetNameEnd = keywordPostDirectional ? index - 1 : index;
      const keywordPreDirectional =
        keywordStreetNameEnd > 2 ? DIRECTIONALS[tokens[1].normalized] : undefined;
      const keywordStreetNameStart = keywordPreDirectional ? 2 : 1;

      return {
        tokens,
        diagnostics: [],
        candidates: [
          {
            id: "unit-keyword-as-unit",
            assumptions: ["unit-keyword-is-unit"],
            sourceSpans: {
              houseNumber: span(tokens[0]),
              street: span(tokens[1], tokens[index - 1]),
              secondary: span(
                tokens[index],
                keywordNumberTokens[keywordNumberTokens.length - 1] ??
                  tokens[index],
              ),
            },
            components: {
              houseNumber: tokens[0].normalized,
              ...(keywordPreDirectional
                ? { preDirectional: keywordPreDirectional }
                : {}),
              streetName: tokens
                .slice(keywordStreetNameStart, keywordStreetNameEnd)
                .map((token) => token.normalized)
                .join(" "),
              ...(keywordPostDirectional
                ? { postDirectional: keywordPostDirectional }
                : {}),
              secondary: {
                designator: keywordDesignator,
                ...(keywordNumber ? { number: keywordNumber } : {}),
              },
              city: normalize(input.city),
              state: normalize(input.state),
              postalCode: normalize(input.postalCode),
            },
          },
          {
            ...literalCandidate,
            id: "unit-keyword-as-street",
            assumptions: ["unit-keyword-is-street"],
          },
        ],
      };
    }

    return {
      tokens,
      diagnostics: [],
      candidates: [literalCandidate],
    };
  }

  if (
    tokens.length < 4 ||
    unitDesignatorIndex < 3 ||
    !streetSuffix ||
    (unitNumberRequired && !unitNumber)
  ) {
    return {
      tokens,
      candidates: [],
      diagnostics: ["unrecognized-delivery-line"],
    };
  }

  const houseNumber = tokens[0];
  const explicitPreDirectional = DIRECTIONALS[tokens[1].normalized];
  const explicitStreetNameStart = explicitPreDirectional ? 2 : 1;
  const streetName = tokens
    .slice(explicitStreetNameStart, suffixIndex)
    .map((token) => token.normalized)
    .join(" ");

  return {
    tokens,
    diagnostics: [],
    candidates: [
      {
        id: "explicit-unit",
        sourceSpans: {
          houseNumber: span(houseNumber),
          street: span(tokens[1], tokens[unitDesignatorIndex - 1]),
          secondary: span(
            tokens[unitDesignatorIndex],
            unitNumberTokens[unitNumberTokens.length - 1] ??
              tokens[unitDesignatorIndex],
          ),
        },
        components: {
          houseNumber: houseNumber.normalized,
          ...(explicitPreDirectional
            ? { preDirectional: explicitPreDirectional }
            : {}),
          streetName,
          streetSuffix,
          ...(explicitPostDirectional
            ? { postDirectional: explicitPostDirectional }
            : {}),
          secondary: {
            designator: unitDesignator,
            ...(unitNumber ? { number: unitNumber } : {}),
          },
          city: normalize(input.city),
          state: normalize(input.state),
          postalCode: normalize(input.postalCode),
        },
        assumptions: [],
      },
    ],
  };
}

/**
 * Interprets a US-style address whose delivery line and locality fields share
 * one string. Plausible street/city boundaries are preserved as candidates;
 * callers should use an AddressIndex to establish which candidate exists.
 */
export function interpretFullAddress(
  fullAddress: string,
): AddressInterpretation {
  const tokens = tokenize(fullAddress);

  if (!tokens[0] || !/\d/.test(tokens[0].normalized)) {
    return { tokens, candidates: [], diagnostics: ["missing-house-number"] };
  }

  const finalToken = tokens[tokens.length - 1];
  const postalCodeIndex =
    finalToken && /^\d{5}(?:-\d{4})?$/.test(finalToken.normalized)
      ? tokens.length - 1
      : undefined;
  const possibleState = findTrailingState(
    tokens,
    postalCodeIndex ?? tokens.length,
  );
  const hasAnySeparator = tokens.some((token, index) => {
    const nextToken = tokens[index + 1];
    return nextToken
      ? hasLocalitySeparator(fullAddress, token, nextToken)
      : false;
  });

  if (
    postalCodeIndex === undefined &&
    possibleState === undefined &&
    !hasAnySeparator &&
    tokens.length < 4
  ) {
    return interpretAddress({ deliveryLine: fullAddress });
  }

  const localityShapes: LocalityShape[] = [];

  if (postalCodeIndex !== undefined) {
    if (possibleState) {
      localityShapes.push({
        localityEnd: possibleState.start,
        state: possibleState,
        postalCodeIndex,
      });
    }

    localityShapes.push({
      localityEnd: postalCodeIndex,
      postalCodeIndex,
    });
  } else {
    if (possibleState) {
      localityShapes.push({
        localityEnd: possibleState.start,
        state: possibleState,
      });
    }

    // A trailing state-shaped token can also be part of a city or delivery
    // line (for example, "New York"). Preserve that competing reading.
    localityShapes.push({ localityEnd: tokens.length });
  }

  const candidates: AddressCandidate[] = [];
  const candidateKeys = new Set<string>();

  for (const localityShape of localityShapes) {
    if (localityShape.localityEnd < 2) continue;

    const separatorSplits: number[] = [];

    for (let split = 2; split < localityShape.localityEnd; split += 1) {
      if (
        hasLocalitySeparator(
          fullAddress,
          tokens[split - 1],
          tokens[split],
        )
      ) {
        separatorSplits.push(split);
      }
    }

    const splitPoints =
      separatorSplits.length > 0
        ? [...separatorSplits, localityShape.localityEnd]
        : Array.from(
            { length: localityShape.localityEnd - 1 },
            (_, index) => index + 2,
          );

    for (const split of new Set(splitPoints)) {
      const deliveryLastToken = tokens[split - 1];
      if (!deliveryLastToken) continue;

      const cityTokens = tokens.slice(split, localityShape.localityEnd);
      const city = cityTokens.length
        ? cityTokens.map((token) => token.normalized).join(" ")
        : undefined;
      const state = localityShape.state?.abbreviation;
      const postalCode =
        localityShape.postalCodeIndex === undefined
          ? undefined
          : tokens[localityShape.postalCodeIndex]?.normalized;
      const deliveryInterpretation = interpretAddress({
        deliveryLine: fullAddress.slice(0, deliveryLastToken.end),
        city,
        state,
        postalCode,
      });
      const citySpan = cityTokens[0]
        ? span(cityTokens[0], cityTokens[cityTokens.length - 1])
        : undefined;
      const stateSpan = localityShape.state
        ? span(
            tokens[localityShape.state.start],
            tokens[localityShape.state.end - 1],
          )
        : undefined;
      const postalCodeSpan =
        localityShape.postalCodeIndex === undefined
          ? undefined
          : span(tokens[localityShape.postalCodeIndex]);
      const boundaryWasExplicit =
        cityTokens[0] !== undefined &&
        hasLocalitySeparator(
          fullAddress,
          deliveryLastToken,
          cityTokens[0],
        );
      const localityAssumptions = [
        ...(citySpan && !boundaryWasExplicit
          ? ["street-city-boundary-inferred"]
          : []),
        ...(stateSpan ? ["trailing-state-is-locality"] : []),
        ...(postalCodeSpan ? ["trailing-postal-code-is-locality"] : []),
      ];

      for (const candidate of deliveryInterpretation.candidates) {
        const sourceSpans: AddressCandidateSourceSpans = {
          ...candidate.sourceSpans,
          ...(citySpan ? { city: citySpan } : {}),
          ...(stateSpan ? { state: stateSpan } : {}),
          ...(postalCodeSpan ? { postalCode: postalCodeSpan } : {}),
        };

        addUniqueCandidate(candidates, candidateKeys, {
          ...candidate,
          id: `${candidate.id}:full:${componentSpanId(
            sourceSpans.street,
          )}:${componentSpanId(citySpan)}:${componentSpanId(
            stateSpan,
          )}:${componentSpanId(postalCodeSpan)}`,
          assumptions: [
            ...candidate.assumptions,
            ...localityAssumptions,
          ],
          sourceSpans,
        });
      }
    }
  }

  if (postalCodeIndex !== undefined) {
    const deliveryOnlyInterpretation = interpretAddress({
      deliveryLine: fullAddress,
    });

    for (const candidate of deliveryOnlyInterpretation.candidates) {
      addUniqueCandidate(candidates, candidateKeys, {
        ...candidate,
        id: `${candidate.id}:full:${componentSpanId(
          candidate.sourceSpans.street,
        )}:none:none:none`,
        assumptions: [
          ...candidate.assumptions,
          "trailing-locality-shaped-tokens-are-delivery-line",
        ],
      });
    }
  }

  if (candidates.length === 0) {
    const deliveryOnlyInterpretation = interpretAddress({
      deliveryLine: fullAddress,
    });
    return {
      tokens,
      candidates: deliveryOnlyInterpretation.candidates,
      diagnostics: deliveryOnlyInterpretation.diagnostics,
    };
  }

  return { tokens, candidates, diagnostics: [] };
}

async function resolveInterpretation<T>(
  interpretation: AddressInterpretation,
  index: AddressIndex<T>,
): Promise<AddressResolution<T>> {
  if (interpretation.candidates.length === 0) {
    return { status: "invalid", interpretation };
  }

  const matches = await index.lookupCandidates(interpretation.candidates);

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
