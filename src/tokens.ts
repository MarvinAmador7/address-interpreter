import type {
  AddressDiagnostic,
  AddressInput,
  AddressLocality,
  AddressToken,
  SourceSpan,
} from "./types";
import { STATE_ABBREVIATIONS, STATE_NAMES } from "./vocabulary";

// Exceeding a limit fails the entire interpretation. Never resolve a truncated set.
export const ADDRESS_LIMITS = Object.freeze({
  characters: 4096,
  tokens: 128,
  candidates: 256,
});

export function optionsDiagnostic(
  options: unknown,
): AddressDiagnostic | undefined {
  if (options === undefined) return;
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    ("spellingAlternatives" in options &&
      options.spellingAlternatives !== undefined &&
      typeof options.spellingAlternatives !== "boolean")
  )
    return "invalid-input";
}

export function inputDiagnostic(input: unknown): AddressDiagnostic | undefined {
  if (!input || typeof input !== "object" || !("deliveryLine" in input))
    return "invalid-input";
  const fields = [
    "deliveryLine",
    "city",
    "state",
    "postalCode",
    "urbanization",
  ] as const;
  const values = fields.map((field) => (input as AddressInput)[field]);
  if (
    typeof values[0] !== "string" ||
    values.some((value) => value !== undefined && typeof value !== "string")
  )
    return "invalid-input";
  if (values.some((value) => value && value.length > ADDRESS_LIMITS.characters))
    return "input-too-long";
  return undefined;
}

export function tokenize(input: string): AddressToken[] {
  return Array.from(input.matchAll(/#|[^\s#,;:]+[,;:]*|[,;:]+/gu), (match) => ({
    raw: match[0],
    normalized: normalizeToken(match[0]),
    start: match.index,
    end: match.index + match[0].length,
  }));
}

const fractions: Readonly<Record<string, string>> = {
  "¼": "1/4",
  "½": "1/2",
  "¾": "3/4",
  "⅓": "1/3",
  "⅔": "2/3",
  "⅛": "1/8",
  "⅜": "3/8",
  "⅝": "5/8",
  "⅞": "7/8",
};

export function normalizeToken(raw: string): string {
  const normalized = raw
    .replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g, (value) => ` ${fractions[value]}`)
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[’‘]/g, "'")
    .replace(/[‐‑–−]/g, "-")
    .replace(/⁄/g, "/")
    .replace(/^[,;:]+|[,;:.]+$/g, "")
    .trim();
  return /^[A-Z.]+$/.test(normalized)
    ? normalized.replaceAll(".", "")
    : normalized;
}

export function normalize(value: string | undefined): string | undefined {
  return (
    value?.normalize("NFC").trim().replace(/\s+/g, " ").toUpperCase() ||
    undefined
  );
}

export function normalizeState(value: string | undefined): string | undefined {
  const name = normalize(value);
  if (!name) return undefined;
  const abbreviation = normalizeToken(name);
  return STATE_ABBREVIATIONS.has(abbreviation)
    ? abbreviation
    : Object.prototype.hasOwnProperty.call(STATE_NAMES, name)
      ? STATE_NAMES[name]
      : name;
}

export function normalizePostalCode(
  value: string | undefined,
): string | undefined {
  return normalize(value)?.replace(/^(\d{5})[ -]?(\d{4})$/, "$1-$2");
}

export function locality(input: AddressInput): AddressLocality {
  return {
    city: normalize(input.city),
    state: normalizeState(input.state),
    postalCode: normalizePostalCode(input.postalCode),
    ...(input.urbanization
      ? { urbanization: normalize(input.urbanization) }
      : {}),
  };
}

export function span(
  first: AddressToken,
  last: AddressToken = first,
): SourceSpan {
  return { start: first.start, end: last.end };
}

export function words(tokens: readonly AddressToken[]): string {
  return tokens.map((token) => token.normalized).join(" ");
}

export function hasSeparator(
  input: string,
  left: AddressToken,
  right: AddressToken,
): boolean {
  return /[,;:\r\n]/.test(
    left.raw.slice(-1) + input.slice(left.end, right.start),
  );
}
