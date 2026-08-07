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
              streetName: tokens
                .slice(1)
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
    const literalPreDirectional = DIRECTIONALS[tokens[1].normalized];
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
            streetName: tokens
              .slice(1)
              .map((token) => token.normalized)
              .join(" "),
            city: normalize(input.city),
            state: normalize(input.state),
            postalCode: normalize(input.postalCode),
          },
        },
      ],
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

export function createAddressResolver<T>(
  index: AddressIndex<T>,
): AddressResolver<T> {
  return {
    async resolve(input) {
      const interpretation = interpretAddress(input);

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
    },
  };
}
