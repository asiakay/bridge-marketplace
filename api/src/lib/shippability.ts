// Categories that cannot be shipped via standard carrier.
// Listings in these categories are automatically set to local_pickup.
const NON_SHIPPABLE_CATEGORIES = new Set([
  'furniture_oversized',
  'hazmat',
  'batteries_standalone',
  'aerosols',
  'flammables',
  'perishables',
  'live_animals',
]);

// Carrier limits (USPS/UPS/FedEx common ceiling)
const MAX_WEIGHT_OZ = 70 * 16; // 70 lbs
const MAX_LONGEST_SIDE_IN = 108;
const MAX_LENGTH_PLUS_GIRTH_IN = 165; // length + 2*(width+height)

export type ShippabilityResult =
  | { shippable: true }
  | { shippable: false; reason: string };

export function checkShippability(
  category: string,
  weightOz: number,
  lengthIn: number,
  widthIn: number,
  heightIn: number
): ShippabilityResult {
  if (NON_SHIPPABLE_CATEGORIES.has(category)) {
    return { shippable: false, reason: `Items in category "${category}" must be picked up locally` };
  }

  if (weightOz > MAX_WEIGHT_OZ) {
    return { shippable: false, reason: 'Item exceeds 70 lb carrier weight limit — local pickup only' };
  }

  const longest = Math.max(lengthIn, widthIn, heightIn);
  if (longest > MAX_LONGEST_SIDE_IN) {
    return { shippable: false, reason: 'Longest dimension exceeds 108 in carrier limit — local pickup only' };
  }

  // Sort descending to compute girth correctly
  const dims = [lengthIn, widthIn, heightIn].sort((a, b) => b - a);
  const girth = 2 * (dims[1] + dims[2]);
  if (dims[0] + girth > MAX_LENGTH_PLUS_GIRTH_IN) {
    return { shippable: false, reason: 'Item exceeds carrier size limit (length + girth) — local pickup only' };
  }

  return { shippable: true };
}

export const SHIPPABLE_CATEGORIES = [
  'clothing',
  'shoes',
  'accessories',
  'electronics_small',
  'books',
  'toys',
  'kitchenware',
  'tools_small',
  'art',
  'collectibles',
  'sporting_goods_small',
  'baby_items',
  'health_beauty',
  'home_decor_small',
  'music_instruments_small',
  'other',
];

export const ALL_CATEGORIES = [
  ...SHIPPABLE_CATEGORIES,
  ...Array.from(NON_SHIPPABLE_CATEGORIES),
];
