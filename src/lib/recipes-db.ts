import { sql } from './db';
import { deriveAllergens } from './recipes';
import { compatibility, type CompatMember, type CompatResult } from './engine/compat';
import type { EngineRecipe } from './engine/score';
import type { Allergen, Aisle, MealType, Tag, Unit } from './vocab';

export interface RecipeIngredientRow {
  id: number;
  name: string;
  quantity: number | null;
  unit: Unit | null;
  aisle: Aisle;
  allergens: Allergen[];
  optional: boolean;
  note: string | null;
}

export interface RecipeRow {
  id: number;
  name: string;
  description: string;
  meal_types: MealType[];
  tags: Tag[];
  servings: number;
  prep_minutes: number;
  cook_minutes: number;
  method: string[];
  source_url: string | null;
  favourite: boolean;
  archived: boolean;
  seeded: boolean;
  created_at: string;
  updated_at: string;
  ingredients: RecipeIngredientRow[];
}

export interface RecipeWithCompat extends RecipeRow {
  allergens: Allergen[];
  ingredientCount: number;
  totalMinutes: number;
  compat: CompatResult;
}

// Every recipe row plus its ingredients, aggregated in one query — the
// household's whole menu is small (dozens of recipes), so a single
// unfiltered fetch with server-side derivation is simpler and plenty fast,
// versus building a dynamic WHERE clause for q/mealType/tag/archived.
// Plain parameterised SQL (via sql.query) rather than the tagged-template
// form, since neon's `sql` tagged template executes immediately on each
// call — it can't be composed into a shared fragment the way this query is
// reused between the list and single-recipe fetches below.
const RECIPE_WITH_INGREDIENTS_SELECT = `
  SELECT r.id, r.name, r.description, r.meal_types, r.tags, r.servings, r.prep_minutes,
         r.cook_minutes, r.method, r.source_url, r.favourite, r.archived, r.seeded,
         r.created_at, r.updated_at,
         COALESCE(
           json_agg(
             json_build_object(
               'id', i.id, 'name', i.name, 'quantity', i.quantity, 'unit', i.unit,
               'aisle', i.aisle, 'allergens', i.allergens, 'optional', i.optional, 'note', i.note
             ) ORDER BY i.position
           ) FILTER (WHERE i.id IS NOT NULL),
           '[]'::json
         ) AS ingredients
  FROM fm_recipes r
  LEFT JOIN fm_recipe_ingredients i ON i.recipe_id = r.id
`;

export async function fetchAllRecipes(): Promise<RecipeRow[]> {
  const rows = await sql.query(`${RECIPE_WITH_INGREDIENTS_SELECT} GROUP BY r.id ORDER BY r.name ASC`);
  return rows as RecipeRow[];
}

export async function fetchRecipeById(id: number): Promise<RecipeRow | null> {
  const rows = await sql.query(`${RECIPE_WITH_INGREDIENTS_SELECT} WHERE r.id = $1 GROUP BY r.id`, [id]);
  return (rows[0] as RecipeRow | undefined) ?? null;
}

export async function fetchMembersForCompat(): Promise<CompatMember[]> {
  const rows = await sql`SELECT id, name, restrictions, allergies FROM fm_members`;
  return rows as CompatMember[];
}

/** Attaches derived allergens, counts and household compatibility to a raw recipe row. */
export function attachDerived(recipe: RecipeRow, members: CompatMember[]): RecipeWithCompat {
  const allergens = deriveAllergens(recipe.ingredients);
  const compat = compatibility({ tags: recipe.tags, ingredients: recipe.ingredients }, members);
  return {
    ...recipe,
    allergens,
    ingredientCount: recipe.ingredients.length,
    totalMinutes: recipe.prep_minutes + recipe.cook_minutes,
    compat,
  };
}

export async function fetchAllRecipesWithCompat(): Promise<RecipeWithCompat[]> {
  const [recipes, members] = await Promise.all([fetchAllRecipes(), fetchMembersForCompat()]);
  return recipes.map((recipe) => attachDerived(recipe, members));
}

export async function fetchRecipeByIdWithCompat(id: number): Promise<RecipeWithCompat | null> {
  const [recipe, members] = await Promise.all([fetchRecipeById(id), fetchMembersForCompat()]);
  if (!recipe) return null;
  return attachDerived(recipe, members);
}

export interface RecipeRecordByMember {
  memberId: number;
  clean: number;
  half: number;
  left: number;
}

export interface RecipeRecord {
  timesPlated: number;
  lastPlated: string | null;
  byMember: RecipeRecordByMember[];
}

/** The menu card's "Kitchen record": how many times a dish has been plated, and how it's gone down per member. Slice 3 — only fetched for a single recipe's detail view, not the list. */
export async function fetchRecipeRecord(recipeId: number): Promise<RecipeRecord> {
  const [summaryRows, memberRows] = await Promise.all([
    sql`
      SELECT COUNT(*)::int AS times_plated, MAX(service_date)::text AS last_plated
      FROM fm_plan_entries
      WHERE recipe_id = ${recipeId} AND status = 'plated'
    `,
    sql`
      SELECT member_id,
        COUNT(*) FILTER (WHERE verdict = 'clean')::int AS clean,
        COUNT(*) FILTER (WHERE verdict = 'half')::int AS half,
        COUNT(*) FILTER (WHERE verdict = 'left')::int AS "left"
      FROM fm_ratings
      WHERE recipe_id = ${recipeId}
      GROUP BY member_id
    `,
  ]);
  const summary = summaryRows[0] as { times_plated: number; last_plated: string | null };
  return {
    timesPlated: summary.times_plated,
    lastPlated: summary.last_plated,
    byMember: (memberRows as { member_id: number; clean: number; half: number; left: number }[]).map((r) => ({
      memberId: r.member_id,
      clean: r.clean,
      half: r.half,
      left: r.left,
    })),
  };
}

/** RecipeRow (DB shape) -> EngineRecipe (what score.ts/fill.ts take). Slice 3. */
export function toEngineRecipe(recipe: RecipeRow): EngineRecipe {
  return {
    id: recipe.id,
    name: recipe.name,
    tags: recipe.tags,
    mealTypes: recipe.meal_types,
    ingredients: recipe.ingredients.map((i) => ({ name: i.name, aisle: i.aisle, allergens: i.allergens, optional: i.optional })),
    prepMinutes: recipe.prep_minutes,
    cookMinutes: recipe.cook_minutes,
    favourite: recipe.favourite,
    archived: recipe.archived,
  };
}
