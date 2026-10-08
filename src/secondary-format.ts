import type {
  AddressCandidate,
  AddressToken,
  StreetAddressComponents,
} from "./types";

/** Secondary interpretations preserve the full chain and original identifier. */
export function expandSecondaryForms(
  candidate: AddressCandidate,
  candidates: readonly AddressCandidate[],
  tokens: readonly AddressToken[],
  spellingAlternatives: boolean,
  emit: (candidate: AddressCandidate) => void,
): void {
  const original = candidate.components as StreetAddressComponents;
  if (!original.secondary?.number) return;
  const results = [...candidates];
  const add = (
    base: AddressCandidate,
    assumption: string,
    components: StreetAddressComponents,
    sourceSpans: AddressCandidate["sourceSpans"] = base.sourceSpans,
  ) => {
    if (!/[\p{L}\p{N}]/u.test(components.streetName)) return;
    const result = {
      ...base,
      id: `${base.id}:${assumption}`,
      components,
      sourceSpans,
      assumptions: [...base.assumptions, assumption],
    };
    results.push(result);
    emit(result);
  };
  const number = original.secondary?.number;
  if (
    number === original.houseNumber &&
    !original.secondary?.designator &&
    !original.secondaryUnits
  ) {
    for (const base of results.slice()) {
      const { secondary: _, ...components } =
        base.components as StreetAddressComponents;
      add(base, "repeated-house-number", components);
    }
  }
  const repeated = number?.match(/^([A-Z0-9]+(?:[-/][A-Z0-9]+)*) \1$/);
  if (repeated) {
    const secondary = { ...original.secondary, number: repeated[1] };
    for (const base of results.slice())
      add(base, "repeated-secondary-identifier", {
        ...(base.components as StreetAddressComponents),
        secondary,
        ...(original.secondaryUnits
          ? {
              secondaryUnits: [
                ...original.secondaryUnits.slice(0, -1),
                secondary,
              ],
            }
          : {}),
      });
  }
  const separatedUnit =
    number?.match(/^([A-Z]{1,3})(\d+[A-Z]?)$/) ??
    number?.match(/^(\d+)([A-Z]{1,3})$/);
  if (spellingAlternatives && separatedUnit) {
    const secondary = {
      ...original.secondary,
      number: `${separatedUnit[1]}-${separatedUnit[2]}`,
    };
    for (const base of results.slice())
      add(base, "secondary-identifier-punctuation", {
        ...(base.components as StreetAddressComponents),
        secondary,
        ...(original.secondaryUnits
          ? {
              secondaryUnits: [
                ...original.secondaryUnits.slice(0, -1),
                secondary,
              ],
            }
          : {}),
      });
  }
  if (
    spellingAlternatives &&
    number &&
    /^(?:[A-Z]{1,3} \d+[A-Z]?|\d+ [A-Z]{1,3})$/.test(number)
  ) {
    const secondary = {
      ...original.secondary,
      number: number.replace(" ", ""),
    };
    for (const base of results.slice())
      add(base, "secondary-identifier-spacing", {
        ...(base.components as StreetAddressComponents),
        secondary,
        ...(original.secondaryUnits
          ? {
              secondaryUnits: [
                ...original.secondaryUnits.slice(0, -1),
                secondary,
              ],
            }
          : {}),
      });
  }
  if (
    spellingAlternatives &&
    number &&
    /^(?:[A-Z]{1,4}-\d+[A-Z]?|\d+-[A-Z]{1,4})$/.test(number)
  ) {
    const secondary = {
      ...original.secondary,
      number: number.replace("-", ""),
    };
    for (const base of results.slice())
      add(base, "secondary-identifier-punctuation", {
        ...(base.components as StreetAddressComponents),
        secondary,
        ...(original.secondaryUnits
          ? {
              secondaryUnits: [
                ...original.secondaryUnits.slice(0, -1),
                secondary,
              ],
            }
          : {}),
      });
  }
  // A delimited compound identifier can encode building + unit. Keep the opaque
  // identifier too, and never split an already explicit building/unit chain.
  const compound = number?.match(
    /^([A-Z0-9]{1,5})-([A-Z]{1,3}|\d{2,6}[A-Z]?)$/,
  );
  const identifierToken = tokens.find(
    (token) =>
      token.normalized === number &&
      token.start >= (candidate.sourceSpans.secondary?.start ?? Infinity) &&
      token.end <= (candidate.sourceSpans.secondary?.end ?? -1),
  );
  const separator = identifierToken?.raw.search(/[-‐‑–−－]/u) ?? -1;
  if (
    compound &&
    identifierToken &&
    separator > 0 &&
    !original.secondaryUnits &&
    original.secondary &&
    [undefined, "#", "APT", "UNIT", "STE"].includes(
      original.secondary.designator,
    )
  ) {
    const units = [
      { designator: "BLDG", number: compound[1] },
      {
        designator: original.secondary.designator ?? "UNIT",
        number: compound[2],
      },
    ];
    for (const base of results.slice()) {
      add(
        base,
        "compound-unit-is-building-and-unit",
        {
          ...(base.components as StreetAddressComponents),
          secondary: units[1],
          secondaryUnits: units,
        },
        {
          ...base.sourceSpans,
          secondaryUnits: [
            {
              start: identifierToken.start,
              end: identifierToken.start + separator,
            },
            {
              start: identifierToken.start + separator + 1,
              end: identifierToken.end,
            },
          ],
        },
      );
    }
  }
}
