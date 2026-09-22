import { deriveAllergens, GELATINE_PATTERN, HONEY_PATTERN, type AisleIngredientLike } from '../recipes';
import { wordBoundaryPattern } from '../textMatch';
import { ALLERGENS, type Allergen } from '../vocab';

export interface CompatRecipe {
  tags: string[];
  ingredients: AisleIngredientLike[];
}

export interface CompatMember {
  id: number;
  name: string;
  restrictions: string[];
  allergies: string[];
}

export interface CompatConflict {
  memberId: number;
  memberName: string;
  reason: string;
}

export interface CompatResult {
  safe: boolean;
  conflicts: CompatConflict[];
}

// Ingredient names that, if present, are conservatively assumed to break
// halal and kosher (pork family) or kosher alone (shellfish, handled via
// the derived allergen instead — see below). This is deliberately
// conservative: it only catches ingredients named after the excluded food,
// not e.g. cross-contamination, shared equipment, or non-pork "sausage"
// varieties that happen to share the word. A false positive here (flagging
// a chicken sausage) is far safer than a false negative on a real dietary
// requirement.
const PORK_FAMILY = /\b(pork|bacon|ham|gammon|sausages?|lard)\b/i;

// fm_members allows a free-text "custom" allergy alongside the nine preset
// ALLERGENS. A preset allergy is checked against the recipe's *derived*
// allergens (deriveAllergens, keyword-tagged per ingredient). A custom
// allergy has no such tag to check against, so instead it's matched
// directly against every non-optional ingredient's NAME: case-insensitive,
// word-boundary aware (so "nut" doesn't match "nutmeg" or "coconut", same
// rule as allergens.ts), and singular/plural tolerant (a member allergy of
// "kiwi" matches an ingredient named "kiwi fruit" or "kiwis" alike).
const PRESET_ALLERGENS = new Set<string>(ALLERGENS);

// Singular/plural-tolerant, word-boundary matching (e.g. "kiwi" as a
// member's own allergy matches "kiwi fruit" and "kiwis" alike) — shared with
// engine/score.ts's like/dislike matching via src/lib/textMatch.ts, so the
// two engines can't drift on what counts as a match.
const customAllergyPattern = wordBoundaryPattern;

/**
 * Whether a recipe is safe for the given household members, and why not
 * when it isn't. A conflict is raised per member per broken rule, so one
 * member can appear more than once (e.g. both an allergy and a
 * restriction conflict).
 */
export function compatibility(recipe: CompatRecipe, members: CompatMember[]): CompatResult {
  const derived: Allergen[] = deriveAllergens(recipe.ingredients);
  const nonOptional = recipe.ingredients.filter((i) => !i.optional);
  const conflicts: CompatConflict[] = [];

  for (const member of members) {
    for (const allergy of member.allergies) {
      if (PRESET_ALLERGENS.has(allergy)) {
        if (derived.includes(allergy as Allergen)) {
          conflicts.push({ memberId: member.id, memberName: member.name, reason: `Allergic to ${allergy}` });
        }
        continue;
      }

      // Custom (non-preset) allergy — match ingredient names directly, see
      // the header comment above.
      const pattern = customAllergyPattern(allergy);
      if (!pattern) continue;
      const hit = nonOptional.find((i) => pattern.test(i.name));
      if (hit) {
        conflicts.push({
          memberId: member.id,
          memberName: member.name,
          reason: `${member.name} is allergic to ${allergy} (in: ${hit.name})`,
        });
      }
    }

    if (member.restrictions.includes('vegetarian')) {
      if (!(recipe.tags.includes('vegetarian') || recipe.tags.includes('vegan'))) {
        conflicts.push({
          memberId: member.id,
          memberName: member.name,
          reason: 'Vegetarian, but this dish is not tagged vegetarian or vegan',
        });
      }
      // Checked directly against ingredient names, independent of the
      // recipe's own tags — a dish mistakenly tagged vegetarian that still
      // has gelatine in it should still warn a vegetarian member.
      const gelatineIngredient = nonOptional.find((i) => GELATINE_PATTERN.test(i.name));
      if (gelatineIngredient) {
        conflicts.push({
          memberId: member.id,
          memberName: member.name,
          reason: `Vegetarian, but this dish contains ${gelatineIngredient.name} (gelatine is not vegetarian)`,
        });
      }
    }

    if (member.restrictions.includes('vegan')) {
      if (!recipe.tags.includes('vegan')) {
        conflicts.push({
          memberId: member.id,
          memberName: member.name,
          reason: 'Vegan, but this dish is not tagged vegan',
        });
      }
      const gelatineIngredient = nonOptional.find((i) => GELATINE_PATTERN.test(i.name));
      if (gelatineIngredient) {
        conflicts.push({
          memberId: member.id,
          memberName: member.name,
          reason: `Vegan, but this dish contains ${gelatineIngredient.name} (gelatine is not vegan)`,
        });
      }
      const honeyIngredient = nonOptional.find((i) => HONEY_PATTERN.test(i.name));
      if (honeyIngredient) {
        conflicts.push({
          memberId: member.id,
          memberName: member.name,
          reason: `Vegan, but this dish contains ${honeyIngredient.name} (honey is not vegan)`,
        });
      }
    }

    if (member.restrictions.includes('gluten-free') && derived.includes('gluten')) {
      conflicts.push({
        memberId: member.id,
        memberName: member.name,
        reason: 'Gluten-free, but this dish contains gluten',
      });
    }

    if (member.restrictions.includes('dairy-free') && derived.includes('dairy')) {
      conflicts.push({
        memberId: member.id,
        memberName: member.name,
        reason: 'Dairy-free, but this dish contains dairy',
      });
    }

    if (member.restrictions.includes('pescatarian')) {
      const meatIngredient = nonOptional.find(
        (i) => i.aisle === 'meat-fish' && !i.allergens.includes('fish') && !i.allergens.includes('shellfish')
      );
      if (meatIngredient) {
        conflicts.push({
          memberId: member.id,
          memberName: member.name,
          reason: `Pescatarian, but this dish contains ${meatIngredient.name}`,
        });
      }
    }

    const isHalal = member.restrictions.includes('halal');
    const isKosher = member.restrictions.includes('kosher');
    if (isHalal || isKosher) {
      const porky = nonOptional.find((i) => PORK_FAMILY.test(i.name));
      if (porky) {
        const label = isHalal && isKosher ? 'Halal/kosher' : isHalal ? 'Halal' : 'Kosher';
        conflicts.push({
          memberId: member.id,
          memberName: member.name,
          reason: `${label}, but this dish contains ${porky.name}`,
        });
      }
    }
    if (isKosher && derived.includes('shellfish')) {
      conflicts.push({
        memberId: member.id,
        memberName: member.name,
        reason: 'Kosher, but this dish contains shellfish',
      });
    }
  }

  return { safe: conflicts.length === 0, conflicts };
}
