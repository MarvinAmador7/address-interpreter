export interface AddressInput {
  deliveryLine: string;
  city?: string;
  state?: string;
  postalCode?: string;
  urbanization?: string;
}

export interface AddressInterpretationOptions {
  /**
   * Include alternative street/route spellings and secondary identifier spacing
   * or punctuation. Defaults to true. False still normalizes standard suffixes
   * and directionals and retains structural ambiguities and feed repairs.
   * Neither mode ranks candidates or certifies an address exists.
   */
  spellingAlternatives?: boolean;
}

export interface SecondaryAddress {
  designator?: string;
  number?: string;
}

export interface AddressLocality {
  city?: string;
  state?: string;
  postalCode?: string;
  urbanization?: string;
  country?: "US";
}

export interface StreetAddressComponents extends AddressLocality {
  /** Omitted on street candidates for compatibility with earlier releases. */
  kind?: "street";
  houseNumber: string;
  preDirectional?: string;
  streetName: string;
  streetSuffix?: string;
  postDirectional?: string;
  secondary?: SecondaryAddress;
  /** In delivery order, when more than one secondary component is present. */
  secondaryUnits?: readonly SecondaryAddress[];
}

interface MailingAddressBase extends AddressLocality {
  houseNumber?: never;
  preDirectional?: never;
  streetName?: never;
  streetSuffix?: never;
  postDirectional?: never;
  secondary?: never;
  secondaryUnits?: never;
}

export type MailingAddressComponents = MailingAddressBase &
  (
    | { kind: "po-box"; boxNumber: string }
    | {
        kind: "rural-route" | "highway-contract";
        routeNumber: string;
        boxNumber: string;
      }
    | {
        kind: "military";
        militaryUnit: "PSC" | "UNIT" | "CMR";
        routeNumber: string;
        boxNumber: string;
      }
    | { kind: "general-delivery" }
  );

export type AddressComponents =
  | StreetAddressComponents
  | MailingAddressComponents;

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
  houseNumber?: SourceSpan;
  street?: SourceSpan;
  /** Complete non-street delivery instruction. */
  delivery?: SourceSpan;
  boxNumber?: SourceSpan;
  routeNumber?: SourceSpan;
  secondary?: SourceSpan;
  secondaryUnits?: readonly SourceSpan[];
  city?: SourceSpan;
  state?: SourceSpan;
  postalCode?: SourceSpan;
  urbanization?: SourceSpan;
  country?: SourceSpan;
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
  | "unrecognized-delivery-line"
  | "invalid-input"
  | "input-too-long"
  | "too-many-candidates"
  | "incomplete-secondary";

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
