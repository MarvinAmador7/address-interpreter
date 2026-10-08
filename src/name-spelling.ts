import {
  STREET_NAME_ABBREVIATIONS,
  STREET_NAME_EXPANSIONS,
} from "./street-suffixes";
import { compoundNameSpellings } from "./compound-name";

// Spelling alternatives retain the original name. A numbered street's preferred
// spelling ultimately comes from the address index (USPS Publication 28 §235).
const ordinals =
  "ZEROTH FIRST SECOND THIRD FOURTH FIFTH SIXTH SEVENTH EIGHTH NINTH TENTH ELEVENTH TWELFTH THIRTEENTH FOURTEENTH FIFTEENTH SIXTEENTH SEVENTEENTH EIGHTEENTH NINETEENTH".split(
    " ",
  );
const tens =
  "ZERO TEN TWENTY THIRTY FORTY FIFTY SIXTY SEVENTY EIGHTY NINETY".split(" ");
const tensOrdinals =
  "ZEROTH TENTH TWENTIETH THIRTIETH FORTIETH FIFTIETH SIXTIETH SEVENTIETH EIGHTIETH NINETIETH".split(
    " ",
  );
const spelled = new Map<string, number>(
  ordinals.map((name, value) => [name, value]),
);
for (let ten = 2; ten <= 9; ten++) {
  spelled.set(tensOrdinals[ten], ten * 10);
  for (let one = 1; one <= 9; one++)
    spelled.set(`${tens[ten]} ${ordinals[one]}`, ten * 10 + one);
}
const ordinalSuffix = (number: number) =>
  number % 100 >= 11 && number % 100 <= 13
    ? "TH"
    : (({ 1: "ST", 2: "ND", 3: "RD" } as Record<number, string>)[number % 10] ??
      "TH");
const ordinalWord = (number: number) =>
  number < 20
    ? ordinals[number]
    : number < 100
      ? number % 10
        ? `${tens[Math.floor(number / 10)]} ${ordinals[number % 10]}`
        : tensOrdinals[number / 10]
      : undefined;
const directions: Readonly<Record<string, string>> = {
  N: "NORTH",
  S: "SOUTH",
  E: "EAST",
  W: "WEST",
  NE: "NORTHEAST",
  NW: "NORTHWEST",
  SE: "SOUTHEAST",
  SW: "SOUTHWEST",
};

export function streetSpellings(
  name: string,
  hasSuffix: boolean,
  wordAlternatives = true,
): Array<{ name: string; assumption: string }> {
  const variants: Array<{ name: string; assumption: string }> = [];
  const seen = new Set([name]);
  const add = (value: string, assumption: string) => {
    if (!seen.has(value)) {
      seen.add(value);
      variants.push({ name: value, assumption });
    }
  };
  // These words occur inside registered names as well as in suffix position.
  // Offer each observed abbreviation and the all-words reading; do not enumerate
  // a powerset or change a house number / secondary identifier.
  const words = name.split(" ");
  for (const spellings of wordAlternatives
    ? [STREET_NAME_ABBREVIATIONS, STREET_NAME_EXPANSIONS]
    : []) {
    const changed = words.map((word) => spellings.get(word) ?? word);
    for (let index = 0; index < words.length; index++) {
      if (changed[index] === words[index]) continue;
      const one = [...words];
      one[index] = changed[index];
      add(one.join(" "), "street-name-word-abbreviation");
    }
    add(changed.join(" "), "street-name-word-abbreviation");
  }
  if (wordAlternatives) {
    add(name.replace(/\bSAINT\b/g, "ST"), "street-name-abbreviation");
    add(name.replace(/\bST (?=[A-Z])/g, "SAINT "), "street-name-abbreviation");
    for (const compound of hasSuffix ? compoundNameSpellings(words) : [])
      add(compound, "compound-street-name-spacing");
    // Preserve a run of observed initials as one name token. Requiring a
    // following name word excludes a pair of compass abbreviations on its own.
    if (hasSuffix)
      add(
        name.replace(
          /^((?:[A-Z] ){2,3})(?=[A-Z]{2,})/,
          (initials) => initials.replaceAll(" ", "") + " ",
        ),
        "street-name-initial-spacing",
      );
  }
  // Compact route prefixes use either a space or a hyphen before the same
  // observed identifier. Numeric ranges are deliberately left intact.
  add(
    name.replace(/^(CR|SR|US|FM|RT|RTE|HWY) (\d+[A-Z]?)$/, "$1-$2"),
    "route-prefix-punctuation",
  );
  add(
    name.replace(
      /^((?:(?:COUNTY|STATE|US|TOWNSHIP|RANCH) )?(?:ROAD|HIGHWAY|ROUTE)|CR|SR|US|FM|RT|RTE|HWY) (\d+)-([A-Z]{1,2})$/,
      "$1 $2$3",
    ),
    "route-identifier-punctuation",
  );
  // Pub 28 section 232 permits spaces in place of street-name hyphens.
  // This operates only on the parsed name, never house or secondary numbers.
  if (name.includes("-"))
    add(
      name.replace(/([A-Z])\s*-\s*(?=[A-Z0-9])/g, "$1 ").trim(),
      "street-name-hyphen-spacing",
    );
  if (hasSuffix) {
    add(
      name.replace(
        /(?:^| )(N|S|E|W|NE|NW|SE|SW)$/,
        (match, code: string) =>
          (match.startsWith(" ") ? " " : "") + directions[code],
      ),
      "directional-in-street-name",
    );
  }
  if (
    hasSuffix ||
    /^\d{1,4} ?(?:ST|ND|RD|TH)$/.test(name) ||
    spelled.has(name.replaceAll("-", " "))
  ) {
    const ordinal = name.match(/^(\d{1,4}) ?(ST|ND|RD|TH)$/);
    const number = /^\d{1,4}$/.test(name)
      ? Number(name)
      : ordinal && ordinal[2] === ordinalSuffix(Number(ordinal[1]))
        ? Number(ordinal[1])
        : spelled.get(name.replaceAll("-", " "));
    if (number !== undefined) {
      add(`${number}${ordinalSuffix(number)}`, "numbered-street-spelling");
      add(String(number), "numbered-street-spelling");
      const word = ordinalWord(number);
      if (word) add(word, "numbered-street-spelling");
    }
  }
  add(
    name
      .replace(/^ST (?=[A-Z])/, "SAINT ")
      .replace(/^MT (?=[A-Z])/, "MOUNT ")
      .replace(/^FT (?=[A-Z])/, "FORT ")
      .replace(/^(?:AVE|AVEN|AV) (?=[A-Z0-9]+(?: |$))/, "AVENUE "),
    "street-name-abbreviation",
  );
  add(name.replace(/^(MC|MAC) (?=[A-Z])/, "$1"), "surname-spacing");
  if (name.includes("'")) {
    add(name.replaceAll("'", ""), "street-name-punctuation");
    add(
      name.replaceAll("'", " ").replace(/\s+/g, " ").trim(),
      "street-name-punctuation",
    );
  }
  return variants;
}
