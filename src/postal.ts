import type {
  AddressCandidate,
  AddressToken,
  MailingAddressComponents,
} from "./types";
import { span, words } from "./tokens";

const identifier = /^(?=.*\d)[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

/** These formats have identifiers of their own; none has a house or street. */
export function postalCandidate(
  tokens: readonly AddressToken[],
): AddressCandidate | undefined {
  const text = words(tokens);
  let components: MailingAddressComponents;
  let routeIndex: number | undefined;
  let boxIndex: number | undefined;
  if (text === "GENERAL DELIVERY") {
    components = { kind: "general-delivery" };
  } else {
    boxIndex = tokens.length - 1;
    if (!identifier.test(tokens[boxIndex]?.normalized ?? "")) return undefined;
    const boxNumber = tokens[boxIndex].normalized;
    const prefix = words(tokens.slice(0, -1));
    if (/^(?:PO|P O|POST OFFICE) BOX$/.test(prefix)) {
      components = { kind: "po-box", boxNumber };
    } else {
      if (tokens[boxIndex - 1]?.normalized !== "BOX") return undefined;
      routeIndex = boxIndex - 2;
      const routeNumber = tokens[routeIndex]?.normalized;
      if (!routeNumber || !identifier.test(routeNumber)) return undefined;
      const routeType = words(tokens.slice(0, routeIndex));
      if (/^(?:RR|RURAL ROUTE|RFD)$/.test(routeType)) {
        components = { kind: "rural-route", routeNumber, boxNumber };
      } else if (/^(?:HC|HIGHWAY CONTRACT)$/.test(routeType)) {
        components = { kind: "highway-contract", routeNumber, boxNumber };
      } else if (
        routeType === "PSC" ||
        routeType === "UNIT" ||
        routeType === "CMR"
      ) {
        components = {
          kind: "military",
          militaryUnit: routeType,
          routeNumber,
          boxNumber,
        };
      } else return undefined;
    }
  }
  return {
    id: components.kind,
    components,
    assumptions: [],
    sourceSpans: {
      delivery: span(tokens[0], tokens[tokens.length - 1]),
      ...(boxIndex !== undefined ? { boxNumber: span(tokens[boxIndex]) } : {}),
      ...(routeIndex !== undefined
        ? { routeNumber: span(tokens[routeIndex]) }
        : {}),
    },
  };
}
