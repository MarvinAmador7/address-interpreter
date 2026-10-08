import { readFileSync } from "node:fs";
import { US_STATES } from "./research-report/states.mjs";

// Benchmark admission uses source text and source fields only. Never import the
// parser, inspect its candidates, or learn admission rules from match outcomes.
export const CORPUS_POLICY_VERSION = "mls-source-consistency-v1";
export const ACTIVE_CORPUS = ".local/corpus/mls-valid.jsonl";
const suffixes = JSON.parse(readFileSync(new URL("./usps-suffix-aliases.json", import.meta.url), "utf8")).aliases;
const suffixCodes = new Set(Object.values(suffixes));
const directions = { NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W", NORTHEAST: "NE", NORTHWEST: "NW", SOUTHEAST: "SE", SOUTHWEST: "SW" };
const ordinals = "ZEROTH FIRST SECOND THIRD FOURTH FIFTH SIXTH SEVENTH EIGHTH NINTH TENTH ELEVENTH TWELFTH THIRTEENTH FOURTEENTH FIFTEENTH SIXTEENTH SEVENTEENTH EIGHTEENTH NINETEENTH".split(" ");
const fractions = { "½": " 1/2", "¼": " 1/4", "¾": " 3/4", "⅓": " 1/3", "⅔": " 2/3", "⅛": " 1/8", "⅜": " 3/8", "⅝": " 5/8", "⅞": " 7/8" };
const norm = (value) => String(value ?? "").replace(/[½¼¾⅓⅔⅛⅜⅝⅞]/g, (v) => fractions[v]).normalize("NFKC").toUpperCase().replace(/[’‘]/g, "'").replace(/⁄/g, "/").replace(/[‐‑–−]/g, "-").trim();
const words = (value) => norm(value).match(/[\p{L}\p{N}]+/gu) ?? [];
const compact = (value) => words(value).join("");
const stateCodes = new Map(Object.entries(US_STATES).filter(([code]) => code !== "UNKNOWN").map(([code, name]) => [name.toUpperCase(), code]));
const stateWords = new RegExp(`\\b(?:${[...stateCodes.keys()].sort((a, b) => b.length - a.length).join("|")})\\b`, "g");

// These are spelling equivalences, not a location database. A substring check
// tolerates feed spacing; it does not establish registered address identity.
function nameTokens(value) {
  const routes = norm(value)
    .replace(stateWords, (name) => stateCodes.get(name))
    .replace(/\bC\s*R[ -]?(?=\d|[A-Z]{1,2}\b)/g, "COUNTY ROAD ")
    .replace(/\bCO(?:UNTY)?[ .-]+(?:RD|ROAD)\b/g, "COUNTY ROAD")
    .replace(/\bST[ .]+(?=HWY|HIGHWAY|RD|ROAD|RT|ROUTE)/g, "STATE ")
    .replace(/\bS\s*R[ -]?(?=\d|[A-Z]{1,2}\b)/g, "STATE ROAD ")
    .replace(/\bF\s*M[ -]?(?=\d)/g, "FARM TO MARKET ");
  const canonical = words(routes)
    .map((word) => {
      if (/^\d+(ST|ND|RD|TH)$/.test(word)) return word.replace(/(ST|ND|RD|TH)$/, "");
      const ordinal = ordinals.indexOf(word);
      return ordinal >= 0 ? String(ordinal) : directions[word] ?? ({ SAINT: "ST", MOUNT: "MT", FORT: "FT", ROUTE: "RTE", RT: "RTE" })[word] ?? suffixes[word] ?? word;
    }).join(" ")
    .replace(/\bSTATE RTE\b/g, "STATE RD")
    .replace(/\b([A-Z]{2}) (?:HWY |RTE )?(?=\d)/g, (text, code) => code === "US" || (Object.hasOwn(US_STATES, code) && code !== "UNKNOWN") ? code + " " : text);
  return canonical.split(" ");
}
function identifierEvidence(input, expected) {
  const wanted = compact(expected);
  if (!wanted) return true;
  const literalTokens = words(input);
  const canonicalTokens = literalTokens.map((word) => {
    const ordinal = ordinals.indexOf(word);
    return ordinal >= 0 ? String(ordinal) : word.replace(/^(\d+)(ST|ND|RD|TH)$/, "$1");
  });
  // Retain opaque numbers, ranges, slash forms, letter prefixes and leading
  // zero variants. A value appearing elsewhere is conservative evidence only.
  const equivalent = (a) => a === wanted || a.replace(/^0+(?=\d)/, "") === wanted.replace(/^0+(?=\d)/, "");
  for (const tokens of [literalTokens, canonicalTokens]) for (let i = 0; i < tokens.length; i++) {
    for (let size = 1; size <= Math.max(4, words(expected).length) && i + size <= tokens.length; size++) {
      const joined = tokens.slice(i, i + size).join("");
      if (equivalent(joined) || equivalent(joined.replace(/^(APARTMENT|BUILDING|SUITE|FLOOR|SPACE|ROOM|UNIT|BLDG|LOT|APT|STE|FLR|SPC|PH|SP|RM|FL)/, ""))) return true;
      const attached = joined.match(/^([A-Z]+)(\d.*)$/);
      if (attached && (suffixCodes.has(attached[1]) || suffixes[attached[1]]) && equivalent(attached[2])) return true;
    }
  }
  return false;
}
const observedName = (input, expected) => {
  if (compact(input).includes(compact(expected))) return true;
  const actual = nameTokens(input), wanted = nameTokens(expected);
  if (actual.join("").includes(wanted.join(""))) return true;
  // Explicit route/name words can be reordered or interrupted by a unit phrase.
  // Require every word with multiplicity; field boundaries remain parser work.
  for (const word of wanted) {
    const at = actual.indexOf(word);
    if (at < 0) return false;
    actual.splice(at, 1);
  }
  return true;
};

export function assessCorpusRecord(row) {
  const input = norm(row.listing_address);
  const reasons = [];
  if (!input) return { eligible: false, reasons: ["missing-listing-address"] };
  if (!norm(row.house_number) || !norm(row.street_name)) return { eligible: false, reasons: ["missing-reference-primary-fields"] };
  if (/^(?:TBD|TBA|UNKNOWN|UNASSIGNED|N\/?A|NONE|NOT AVAILABLE|TO BE DETERMINED)(?:\b|$)/.test(input))
    reasons.push("placeholder-address");
  // A leading lot phrase may precede a real house number. Only quarantine it
  // when the stored house number cannot be located separately in the input.
  const land = input.match(/^(?:LOTS?|TRACTS?|PARCELS?|ACRES?)\s+\S+\s+(.+)$/);
  if (land && !identifierEvidence(land[1], row.house_number)) reasons.push("land-description");
  if (!identifierEvidence(input, row.house_number)) reasons.push("reference-house-number-not-observed");
  if (!observedName(input, row.street_name)) reasons.push("reference-street-name-not-verified");
  const suffix = suffixes[norm(row.street_suffix)] ?? norm(row.street_suffix);
  if (suffix && !words(input).some((word) => (suffixes[word] ?? word) === suffix || (word.match(/^\d+([A-Z]+)$/)?.[1] === suffix) || (word.startsWith(suffix) && /^\d/.test(word.slice(suffix.length)))))
    reasons.push("reference-street-suffix-not-observed");
  const tokens = words(input).map((word) => directions[word] ?? word);
  const pairs = tokens.slice(0, -1).map((word, i) => word + tokens[i + 1]);
  for (const field of ["pre_directional", "post_directional"]) {
    const expected = directions[norm(row[field])] ?? norm(row[field]);
    if (expected && !tokens.includes(expected) && !pairs.includes(expected)) reasons.push(`reference-${field.replaceAll("_", "-")}-not-observed`);
  }
  if (norm(row.unit) && !identifierEvidence(input, row.unit)) reasons.push("reference-unit-not-observed");
  // Explicit unit text with an empty reference field is an annotation conflict,
  // provided a complete primary address precedes the marker. Bare identifiers
  // and ambiguous words remain in the corpus for the parser to interpret.
  if (!norm(row.unit) && /\b(?:APT|APARTMENT|UNIT|SUITE|STE)\b\s*[-#]?\s*[A-Z0-9]+\s*$/.test(input)) {
    const before = input.split(/\b(?:APT|APARTMENT|UNIT|SUITE|STE)\b/)[0];
    if (identifierEvidence(before, row.house_number) && observedName(before, row.street_name)) reasons.push("explicit-unit-missing-from-reference");
  }
  return { eligible: reasons.length === 0, reasons };
}
