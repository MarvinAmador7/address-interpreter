// General name-forming words, not registered street names or corpus aliases.
// They license a single space boundary alternative. The original name survives.
const elements = new Set(
  (
    "WOOD WOODS FIELD FIELDS BROOK BROOKS CREEK LAKE LAKES SHORE SHORES RIDGE VIEW " +
    "HILL HILLS DALE GLEN PARK MEADOW MEADOWS FOREST MOUNT STONE POINT SPRING SPRINGS " +
    "ROCK OAK OAKS PINE PINES MAPLE CEDAR ELM BIRCH ASH WILLOW WATER BRIDGE RIVER " +
    "BEND CLIFF CREST BAY BEACH COVE SIDE LAND PORT HAVEN GROVE GATE MILL LINE " +
    "FAIR GREEN WHITE BLACK RED BLUE NORTH SOUTH EAST WEST HIGH LOW LONG SHORT OLD NEW " +
    "TREE TOWN HOUSE SCHOOL FOX DEER HORSE CAMP FORD"
  ).split(" "),
);
const compass = new Set(["NORTH", "SOUTH", "EAST", "WEST"]);

export function compoundNameSpellings(words: readonly string[]): string[] {
  const alternatives: string[] = [];
  const supported = (left: string, right: string) =>
    left.length >= 3 &&
    right.length >= 3 &&
    ((elements.has(left) && elements.has(right)) ||
      (left.length >= 4 &&
        right.length >= 4 &&
        (elements.has(left) || elements.has(right)))) &&
    !(compass.has(left) && compass.has(right));
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    if (!/^[A-Z]{3,32}$/.test(word)) continue;
    const next = words[index + 1];
    if (next && /^[A-Z]{3,32}$/.test(next) && supported(word, next)) {
      alternatives.push(
        [...words.slice(0, index), word + next, ...words.slice(index + 2)].join(
          " ",
        ),
      );
    }
    for (let at = 3; at <= word.length - 3; at++) {
      const left = word.slice(0, at),
        right = word.slice(at);
      if (supported(left, right))
        alternatives.push(
          [
            ...words.slice(0, index),
            left,
            right,
            ...words.slice(index + 1),
          ].join(" "),
        );
    }
  }
  return alternatives;
}
