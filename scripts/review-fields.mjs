// Shared editor vocabulary. This module never imports or runs the address parser.
export const FIELD_NAMES = {
  houseNumber: 'House number', preDirectional: 'Direction before street', streetName: 'Street name',
  streetSuffix: 'Street suffix', postDirectional: 'Direction after street', city: 'City', state: 'State',
  postalCode: 'ZIP code', urbanization: 'Urbanization', country: 'Country',
};
export const SECONDARY_NAMES = { building: 'Building', floor: 'Floor', unit: 'Apartment / unit', room: 'Room', lot: 'Lot', space: 'Space', department: 'Department', other: 'Other secondary' };
export const STATUS_NAMES = { address: 'One clear reading', ambiguous: 'Multiple supported readings', unresolved: 'Unsure / needs context', unsupported: 'Address form the editor cannot represent', non_address: 'Clearly not an address' };
const directions = { NORTH:'N', SOUTH:'S', EAST:'E', WEST:'W', NORTHEAST:'NE', NORTHWEST:'NW', SOUTHEAST:'SE', SOUTHWEST:'SW' };
const designators = { APARTMENT:'APT', APT:'APT', BUILDING:'BLDG', BLDG:'BLDG', FLOOR:'FL', FL:'FL', SUITE:'STE', STE:'STE', ROOM:'RM', RM:'RM', UNIT:'UNIT', LOT:'LOT', SPACE:'SPC', SPC:'SPC', DEPARTMENT:'DEPT', DEPT:'DEPT', '#':'#' };
export function sourceText(record, indices) {
  const tokens = record.tokens;
  return indices.map((index, i) => {
    const previous = tokens[indices[i - 1]], token = tokens[index];
    const gap = previous && token.start > previous.end ? ' ' : '';
    return gap + token.raw;
  }).join('');
}
export function canonicalValue(record, indices, role, suffixes = {}) {
  const text = sourceText(record, indices).trim().replace(/\s+/g, ' ').toUpperCase();
  const word = text.replaceAll('.', '');
  if (role === 'streetSuffix') return suffixes[word] ?? text;
  if (role === 'preDirectional' || role === 'postDirectional') return directions[word] ?? text;
  if (role === 'designator') return designators[word] ?? text;
  return text;
}
export function componentReading(record, reading, suffixes) {
  const output = Object.fromEntries(Object.entries(reading.fields).filter(([, ids]) => ids.length)
    .map(([field, ids]) => [field, canonicalValue(record, ids, field, suffixes)]));
  const chain = reading.secondary.map(s => Object.fromEntries([
    ['designator', canonicalValue(record, s.designator, 'designator', suffixes)],
    ['number', canonicalValue(record, s.identifier, 'number', suffixes)],
  ].filter(([, value]) => value)));
  if (chain.length) output.secondaryUnits = chain;
  return output;
}
export const blankReading = () => ({ fields: {}, secondary: [], separators: [], unresolved: [] });
