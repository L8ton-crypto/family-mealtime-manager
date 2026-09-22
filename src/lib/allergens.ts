import { ALLERGENS, AISLES, type Allergen, type Aisle } from './vocab';

// Keyword-based suggestions for an ingredient's allergens and grocery aisle,
// used to auto-fill the editor when a name is typed (the user can always
// override). Matching is case-insensitive and word-boundary aware so
// "nutmeg" doesn't trigger nuts and "eggplant" doesn't trigger eggs — a
// keyword only matches when it appears as a whole word (or whole phrase) in
// the ingredient name, never as a substring of a longer word.
//
// A handful of keywords need an extra exception on top of word-boundary
// matching, because the *keyword itself* is a real standalone word that
// shows up inside an otherwise-safe ingredient name:
//   - "milk" is dairy, but "coconut milk" / "oat milk" / "almond milk" /
//     "soy milk" / "rice milk" / "cashew milk" are plant milks, not dairy.
//   - "butter" is dairy, but "peanut butter" / "almond butter" /
//     "cashew butter" / "cocoa butter" / "apple butter" are not.
//   - "cream" is dairy, but "cream crackers" are a wheat biscuit with no
//     dairy in them — "cream" here describes the colour/style, not an
//     ingredient. Handled with a negative lookahead so only the
//     "cream crackers" phrase is excepted (a recipe calling for actual
//     cream still infers dairy correctly).
// These are handled with a lookaround on just that keyword, so the
// exception never affects any other keyword (e.g. "soy milk" still infers
// soy from the word "soy").
//
// Compound words need their own dedicated keyword entirely, because plain
// word-boundary matching only ever finds whole words — it can't decompose
// "buttermilk" into "butter" + "milk" or "fishcake" into "fish" + "cake"
// (there's no boundary in the middle of a single fused word). "buttermilk"
// and "fishcake(s)" are listed as their own patterns below for this reason.

interface KeywordRule {
  allergen: Allergen;
  pattern: RegExp;
}

const NOT_DAIRY_MILK = '(?<!coconut )(?<!oat )(?<!almond )(?<!soy )(?<!rice )(?<!cashew )(?<!hazelnut )';
const NOT_DAIRY_BUTTER = '(?<!peanut )(?<!almond )(?<!cashew )(?<!cocoa )(?<!apple )(?<!nut )';
const NOT_DAIRY_CREAM = '(?!\\s+crackers?)';

const ALLERGEN_KEYWORDS: KeywordRule[] = [
  // gluten
  { allergen: 'gluten', pattern: /\bflour\b/i },
  { allergen: 'gluten', pattern: /\bbread\b/i },
  { allergen: 'gluten', pattern: /\bbreadcrumbs?\b/i },
  { allergen: 'gluten', pattern: /\bpasta\b/i },
  { allergen: 'gluten', pattern: /\bspaghetti\b/i },
  { allergen: 'gluten', pattern: /\bmacaroni\b/i },
  { allergen: 'gluten', pattern: /\bnoodles?\b/i },
  { allergen: 'gluten', pattern: /\bcouscous\b/i },
  { allergen: 'gluten', pattern: /\bnaan\b/i },
  { allergen: 'gluten', pattern: /\btortilla\b/i },
  { allergen: 'gluten', pattern: /\bsoy sauce\b/i },
  { allergen: 'gluten', pattern: /\bcrackers?\b/i },
  { allergen: 'gluten', pattern: /\bbiscuits?\b/i },
  { allergen: 'gluten', pattern: /\bdigestives?\b/i },
  { allergen: 'gluten', pattern: /\bcrispbread\b/i },
  { allergen: 'gluten', pattern: /\bbrioche\b/i },
  { allergen: 'gluten', pattern: /\bstock cubes?\b/i },
  // dairy
  { allergen: 'dairy', pattern: new RegExp(`${NOT_DAIRY_MILK}\\bmilk\\b`, 'i') },
  { allergen: 'dairy', pattern: /\bbuttermilk\b/i },
  { allergen: 'dairy', pattern: /\bcheese\b/i },
  { allergen: 'dairy', pattern: /\bcheddar\b/i },
  { allergen: 'dairy', pattern: /\bmozzarella\b/i },
  { allergen: 'dairy', pattern: /\bparmesan\b/i },
  { allergen: 'dairy', pattern: /\bfeta\b/i },
  { allergen: 'dairy', pattern: /\bhalloumi\b/i },
  { allergen: 'dairy', pattern: /\bricotta\b/i },
  { allergen: 'dairy', pattern: /\bmascarpone\b/i },
  { allergen: 'dairy', pattern: /\bghee\b/i },
  { allergen: 'dairy', pattern: /\bpaneer\b/i },
  { allergen: 'dairy', pattern: new RegExp(`${NOT_DAIRY_BUTTER}\\bbutter\\b`, 'i') },
  { allergen: 'dairy', pattern: new RegExp(`\\bcream\\b${NOT_DAIRY_CREAM}`, 'i') },
  { allergen: 'dairy', pattern: /\byogh?urt\b/i },
  { allergen: 'dairy', pattern: /\bbrioche\b/i },
  { allergen: 'dairy', pattern: /\bcustard\b/i },
  { allergen: 'dairy', pattern: /\bpesto\b/i },
  // eggs
  { allergen: 'eggs', pattern: /\beggs?\b/i },
  { allergen: 'eggs', pattern: /\bmayonnaise\b/i },
  { allergen: 'eggs', pattern: /\bmayo\b/i },
  { allergen: 'eggs', pattern: /\bbrioche\b/i },
  { allergen: 'eggs', pattern: /\bcustard\b/i },
  // peanuts
  { allergen: 'peanuts', pattern: /\bpeanuts?\b/i },
  // nuts (tree nuts)
  { allergen: 'nuts', pattern: /\bnuts?\b/i },
  { allergen: 'nuts', pattern: /\balmonds?\b/i },
  { allergen: 'nuts', pattern: /\bcashews?\b/i },
  { allergen: 'nuts', pattern: /\bwalnuts?\b/i },
  { allergen: 'nuts', pattern: /\bpecans?\b/i },
  { allergen: 'nuts', pattern: /\bhazelnuts?\b/i },
  { allergen: 'nuts', pattern: /\bpistachios?\b/i },
  { allergen: 'nuts', pattern: /\bmacadamias?\b/i },
  { allergen: 'nuts', pattern: /\bbrazil nuts?\b/i },
  { allergen: 'nuts', pattern: /\bpine nuts?\b/i },
  { allergen: 'nuts', pattern: /\bpesto\b/i },
  // soy
  { allergen: 'soy', pattern: /\bsoy\b/i },
  { allergen: 'soy', pattern: /\bsoya\b/i },
  { allergen: 'soy', pattern: /\btofu\b/i },
  { allergen: 'soy', pattern: /\bedamame\b/i },
  { allergen: 'soy', pattern: /\btamari\b/i },
  // fish
  { allergen: 'fish', pattern: /\bfish\b/i },
  { allergen: 'fish', pattern: /\bfishcakes?\b/i },
  { allergen: 'fish', pattern: /\bsalmon\b/i },
  { allergen: 'fish', pattern: /\btuna\b/i },
  { allergen: 'fish', pattern: /\bcod\b/i },
  { allergen: 'fish', pattern: /\bhaddock\b/i },
  { allergen: 'fish', pattern: /\btrout\b/i },
  { allergen: 'fish', pattern: /\bmackerel\b/i },
  { allergen: 'fish', pattern: /\bsardines?\b/i },
  { allergen: 'fish', pattern: /\banchov(?:y|ies)\b/i },
  { allergen: 'fish', pattern: /\bworcestershire\b/i },
  // shellfish
  { allergen: 'shellfish', pattern: /\bprawns?\b/i },
  { allergen: 'shellfish', pattern: /\bshrimp\b/i },
  { allergen: 'shellfish', pattern: /\bcrab\b/i },
  { allergen: 'shellfish', pattern: /\bmussels?\b/i },
  { allergen: 'shellfish', pattern: /\bscallops?\b/i },
  { allergen: 'shellfish', pattern: /\blobster\b/i },
  { allergen: 'shellfish', pattern: /\bclams?\b/i },
  { allergen: 'shellfish', pattern: /\bsquid\b/i },
  { allergen: 'shellfish', pattern: /\boysters?\b/i },
  // sesame
  { allergen: 'sesame', pattern: /\btahini\b/i },
  { allergen: 'sesame', pattern: /\bsesame\b/i },
];

/**
 * Suggests allergens present in an ingredient from its name, using
 * word-boundary-aware keyword matching. Returns a de-duplicated subset of
 * ALLERGENS in vocab order. Suggestions only — the editor lets the user
 * override per ingredient.
 */
export function inferAllergens(ingredientName: string): Allergen[] {
  const name = ingredientName.trim();
  if (!name) return [];
  const matched = new Set<Allergen>();
  for (const rule of ALLERGEN_KEYWORDS) {
    if (rule.pattern.test(name)) matched.add(rule.allergen);
  }
  // Stable, vocab-ordered output.
  return ALLERGENS.filter((allergen) => matched.has(allergen));
}

interface AisleKeywordRule {
  aisle: Aisle;
  pattern: RegExp;
}

const AISLE_KEYWORDS: AisleKeywordRule[] = [
  // meat-fish (checked before dairy-eggs/produce so e.g. "smoked salmon"
  // and "chicken stock" land here)
  { aisle: 'meat-fish', pattern: /\b(chicken|beef|lamb|pork|mince|sausages?|bacon|gammon|turkey|duck)\b/i },
  { aisle: 'meat-fish', pattern: /\b(salmon|tuna|cod|haddock|trout|mackerel|fish|prawns?|shrimp|crab|mussels?|scallops?|lobster|clams?)\b/i },
  // dairy-eggs
  { aisle: 'dairy-eggs', pattern: new RegExp(`${NOT_DAIRY_MILK}\\bmilk\\b`, 'i') },
  { aisle: 'dairy-eggs', pattern: /\b(cheese|cheddar|mozzarella|parmesan|feta|cream|yoghurt|yogurt)\b/i },
  { aisle: 'dairy-eggs', pattern: new RegExp(`${NOT_DAIRY_BUTTER}\\bbutter\\b`, 'i') },
  { aisle: 'dairy-eggs', pattern: /\beggs?\b/i },
  // bakery
  { aisle: 'bakery', pattern: /\b(bread|baguette|ciabatta|naan|pitta|tortilla|bun|buns|dough|croutons?|breadcrumbs?)\b/i },
  { aisle: 'bakery', pattern: /\bflour\b/i },
  // frozen
  { aisle: 'frozen', pattern: /\bfrozen\b/i },
  // spices
  { aisle: 'spices', pattern: /\b(cumin|paprika|cinnamon|nutmeg|oregano|thyme|basil|coriander seeds?|garam masala|curry powder|chilli powder|herbs|bay leaves?|dill|chives)\b/i },
  // produce
  {
    aisle: 'produce',
    pattern:
      /\b(onions?|garlic|carrots?|celery|peppers?|courgettes?|mushrooms?|tomato(?:es)?|spinach|potato(?:es)?|avocados?|lettuce|cucumbers?|lemons?|limes?|ginger|chill(?:i|ies)|bananas?|berries|apples?|spring onions?)\b/i,
  },
  // pantry (rice, pasta, lentils, beans, oils, canned goods, condiments)
  { aisle: 'pantry', pattern: /\b(rice|pasta|spaghetti|macaroni|couscous|noodles?|lentils?|beans?|chickpeas?|stock|oil|vinegar|sauce|puree|honey|syrup|tahini|hummus)\b/i },
];

/**
 * Suggests a grocery aisle for an ingredient from its name. Falls back to
 * 'pantry' (the catch-all shelf-stable aisle) when nothing matches.
 */
export function inferAisle(ingredientName: string): Aisle {
  const name = ingredientName.trim();
  if (!name) return 'pantry';
  for (const rule of AISLE_KEYWORDS) {
    if (rule.pattern.test(name)) return rule.aisle;
  }
  return 'pantry';
}

// Re-exported for convenience so callers only need to import from here.
export { ALLERGENS, AISLES };
