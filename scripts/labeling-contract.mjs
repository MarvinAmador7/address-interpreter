import { createHash } from "node:crypto";

export const LABEL_SCHEMA = "address-token-roles-v1";
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const FIELDS = ["houseNumber", "preDirectional", "streetName", "streetSuffix",
  "postDirectional", "city", "state", "postalCode", "urbanization", "country",
  "boxNumber", "routeNumber", "deliveryType"];
export const SECONDARY_KINDS = ["building", "floor", "unit", "room", "lot", "space", "department", "other"];
export const STATUSES = ["address", "ambiguous", "unsupported", "non_address", "unresolved"];

// Annotation tokens are independent of the address parser. Splitting letters,
// numbers and punctuation allows evidence within attached forms such as Apt2B.
// Offsets use JavaScript UTF-16 indices; raw strings are never normalized here.
export function annotationTokens(input) {
  return [...input.matchAll(/\p{L}+|\p{N}+|[^\s\p{L}\p{N}]/gu)].map((m, index) => ({
    index, raw: m[0], start: m.index, end: m.index + m[0].length,
  }));
}
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function keys(value, allowed, errors, at) {
  if (!object(value)) { errors.push(`${at}: expected object`); return false; }
  for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`${at}: unknown key ${key}`);
  return true;
}

/** Structural validity is not semantic correctness or approval as gold labels. */
export function validateAnnotation(record, annotation) {
  const errors = [];
  if (!keys(annotation, ["caseId", "inputSha256", "status", "complete", "readings", "notes"], errors, "annotation"))
    return { valid: false, errors };
  if (annotation.caseId !== record.caseId) errors.push("case identity differs");
  if (annotation.inputSha256 !== hash(record.input.deliveryLine)) errors.push("input hash differs");
  if (!STATUSES.includes(annotation.status)) errors.push("unknown status");
  if (typeof annotation.complete !== "boolean") errors.push("complete must be boolean");
  if (typeof annotation.notes !== "string" || annotation.notes.length > 4000) errors.push("notes must be a short string");
  if (!Array.isArray(annotation.readings) || annotation.readings.length > 16)
    return { valid: false, errors: [...errors, "readings must be an array of at most 16"] };
  const supported = ["address", "ambiguous"].includes(annotation.status);
  if (supported && (!annotation.complete || !annotation.readings.length)) errors.push("supported labels require complete readings");
  if (annotation.status === "address" && annotation.readings.length !== 1) errors.push("address requires one reading");
  if (annotation.status === "ambiguous" && annotation.readings.length < 2) errors.push("ambiguous requires multiple readings");
  if (!supported && annotation.complete) errors.push("unresolved/nonaddress/unsupported labels cannot be complete");
  if (!supported && (typeof annotation.notes !== "string" || !annotation.notes.trim())) errors.push("non-supported status requires a reason");
  const tokens = annotationTokens(record.input.deliveryLine);
  for (const [ri, reading] of annotation.readings.entries()) {
    const at = `reading ${ri}`;
    if (!keys(reading, ["fields", "secondary", "separators", "unresolved"], errors, at)) continue;
    const used = new Set();
    const indices = (values, name, punctuationOnly = false) => {
      if (!Array.isArray(values)) { errors.push(`${name}: expected token indices`); return; }
      let previous = -1;
      for (const index of values) {
        if (!Number.isInteger(index) || index < 0 || index >= tokens.length) { errors.push(`${name}: token out of range`); continue; }
        if (index <= previous) errors.push(`${name}: indices must increase`);
        previous = index;
        if (used.has(index)) errors.push(`${name}: duplicate token assignment`);
        used.add(index);
        if (punctuationOnly && !/^[.,;:]$/.test(tokens[index].raw)) errors.push(`${name}: meaningful token cannot be discarded`);
      }
    };
    if (keys(reading.fields, FIELDS, errors, `${at}.fields`)) {
      for (const [name, value] of Object.entries(reading.fields)) indices(value, `${at}.${name}`);
      if (supported && !(reading.fields.houseNumber?.length && reading.fields.streetName?.length) && !reading.fields.deliveryType?.length)
        errors.push(`${at}: requires primary fields or explicit mailing delivery type`);
    }
    if (!Array.isArray(reading.secondary)) errors.push(`${at}: secondary must be an ordered array`);
    else {
      let previousStart = -1;
      for (const [si, secondary] of reading.secondary.entries()) {
        if (!keys(secondary, ["kind", "designator", "identifier"], errors, `${at}.secondary ${si}`)) continue;
        if (!SECONDARY_KINDS.includes(secondary.kind)) errors.push(`${at}: unknown secondary kind`);
        indices(secondary.designator, `${at}.secondary ${si}.designator`);
        indices(secondary.identifier, `${at}.secondary ${si}.identifier`);
        const members = [...(Array.isArray(secondary.designator) ? secondary.designator : []), ...(Array.isArray(secondary.identifier) ? secondary.identifier : [])];
        if (!members.length) errors.push(`${at}: secondary needs source evidence`);
        const start = Math.min(...members);
        if (start <= previousStart) errors.push(`${at}: secondary order differs from source order`);
        previousStart = start;
      }
    }
    indices(reading.separators, `${at}.separators`, true);
    indices(reading.unresolved, `${at}.unresolved`);
    if (supported && reading.unresolved?.length) errors.push(`${at}: complete readings cannot contain unresolved tokens`);
    if (used.size !== tokens.length) errors.push(`${at}: every token must be accounted for`);
  }
  const fingerprints = annotation.readings.map(readingKey);
  if (new Set(fingerprints).size !== fingerprints.length) errors.push("duplicate readings");
  return { valid: !errors.length, errors };
}

function readingKey(reading) {
  return JSON.stringify({
    fields: Object.fromEntries(Object.entries(reading?.fields ?? {}).filter(([, v]) => v?.length).sort(([a], [b]) => a.localeCompare(b))),
    secondary: (Array.isArray(reading?.secondary) ? reading.secondary : []).map((s) => ({
      kind: s?.kind, designator: s?.designator, identifier: s?.identifier,
    })),
    separators: reading?.separators ?? [],
    unresolved: reading?.unresolved ?? [],
  });
}
export function annotationKey(annotation) {
  return JSON.stringify({ status: annotation.status, complete: annotation.complete,
    readings: annotation.readings.map(readingKey).sort() });
}

/** Export explicit raw evidence. No property reference or normalization guesses. */
export function materializeAnnotation(record, annotation) {
  const checked = validateAnnotation(record, annotation);
  if (!checked.valid) throw new Error(checked.errors.join("; "));
  const text = record.input.deliveryLine, tokens = annotationTokens(text);
  const evidence = (indices) => ({
    tokenIndices: indices,
    spans: indices.map((i) => ({ start: tokens[i].start, end: tokens[i].end, raw: tokens[i].raw })),
  });
  return { ...annotation, schemaVersion: LABEL_SCHEMA, id: record.id,
    readings: annotation.readings.map((r) => ({
      fields: Object.fromEntries(Object.entries(r.fields).map(([k, v]) => [k, evidence(v)])),
      secondary: r.secondary.map((s) => ({ kind: s.kind, designator: evidence(s.designator), identifier: evidence(s.identifier) })),
      separators: evidence(r.separators), unresolved: evidence(r.unresolved),
    })) };
}
