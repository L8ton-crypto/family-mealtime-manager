import { sql } from './db';
import { fetchAllRecipes, fetchMembersForCompat, type RecipeRow } from './recipes-db';
import { fetchRatingsForEntryIds } from './ratings-db';
import { deriveAllergens } from './recipes';
import { compatibility, type CompatMember, type CompatResult } from './engine/compat';
import { primaryProtein } from './engine/protein';
import type { HistoryEntry } from './engine/score';
import { comparePlanEntries, comparePlanEntriesForHistory } from './planOrder';
import type { Allergen, MealType, Verdict } from './vocab';
import type { PlanStatus } from './plan-schema';

export interface PlanEntryRow {
  id: number;
  service_date: string;
  slot: MealType;
  recipe_id: number | null;
  custom_name: string | null;
  servings: number | null;
  status: PlanStatus;
  notes: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  attendees: number[];
}

export interface PlanRecipeSummary {
  id: number;
  name: string;
  totalMinutes: number;
  allergens: Allergen[];
  mealTypes: MealType[];
}

export interface PlanEntryRating {
  memberId: number;
  verdict: Verdict;
  note: string | null;
}

export interface PlanEntryWithDetails extends PlanEntryRow {
  recipe: PlanRecipeSummary | null;
  // Computed against the entry's ATTENDEES only, never the whole
  // household — see docs/slices/02-pass.md. null when there's no recipe
  // (a custom entry has nothing to check compatibility against).
  compat: CompatResult | null;
  // Slice 3: every fm_ratings row for this entry, one per member who's
  // plate-checked it. Carried on the entry itself (rather than a separate
  // fetch) so Plate check shows saved verdicts immediately on reopen, and
  // /pass/history can show its "complete" tick without an extra round trip
  // per row — see docs/slices/03-engine.md Build notes for why this extends
  // the API spec's literal shape.
  ratings: PlanEntryRating[];
}

// service_date is cast to ::text so it always comes back as a plain
// YYYY-MM-DD string, matching the "never let a Date conversion shift a
// day" rule in src/lib/dates.ts — regardless of how the underlying driver
// would otherwise serialize a `date` column.
const PLAN_ENTRY_SELECT = `
  SELECT pe.id, pe.service_date::text AS service_date, pe.slot, pe.recipe_id, pe.custom_name,
         pe.servings, pe.status, pe.notes, pe.position, pe.created_at, pe.updated_at,
         COALESCE(
           json_agg(pea.member_id ORDER BY pea.member_id) FILTER (WHERE pea.member_id IS NOT NULL),
           '[]'
         ) AS attendees
  FROM fm_plan_entries pe
  LEFT JOIN fm_plan_entry_attendees pea ON pea.entry_id = pe.id
`;

function attachRecipeAndCompat(
  row: PlanEntryRow,
  recipesById: Map<number, RecipeRow>,
  members: CompatMember[],
  ratingsByEntry: Map<number, PlanEntryRating[]>
): PlanEntryWithDetails {
  const ratings = ratingsByEntry.get(row.id) ?? [];
  if (row.recipe_id === null) {
    return { ...row, recipe: null, compat: null, ratings };
  }
  const recipe = recipesById.get(row.recipe_id);
  if (!recipe) {
    // Defensive only: the FK is ON DELETE SET NULL, so a non-null recipe_id
    // should always resolve. Treat a miss the same as "no recipe" rather
    // than throwing.
    return { ...row, recipe: null, compat: null, ratings };
  }
  const attendeeMembers = members.filter((m) => row.attendees.includes(m.id));
  const compat = compatibility({ tags: recipe.tags, ingredients: recipe.ingredients }, attendeeMembers);
  return {
    ...row,
    recipe: {
      id: recipe.id,
      name: recipe.name,
      totalMinutes: recipe.prep_minutes + recipe.cook_minutes,
      allergens: deriveAllergens(recipe.ingredients),
      mealTypes: recipe.meal_types,
    },
    compat,
    ratings,
  };
}

function groupRatingsByEntry(ratings: { entry_id: number | null; member_id: number; verdict: Verdict; note: string | null }[]): Map<number, PlanEntryRating[]> {
  const map = new Map<number, PlanEntryRating[]>();
  for (const r of ratings) {
    if (r.entry_id === null) continue;
    const list = map.get(r.entry_id) ?? [];
    list.push({ memberId: r.member_id, verdict: r.verdict, note: r.note });
    map.set(r.entry_id, list);
  }
  return map;
}

async function withRecipesAndMembers(
  fetchRows: () => Promise<PlanEntryRow[]>
): Promise<PlanEntryWithDetails[]> {
  const rows = await fetchRows();
  const [recipes, members, ratings] = await Promise.all([
    fetchAllRecipes(),
    fetchMembersForCompat(),
    fetchRatingsForEntryIds(rows.map((r) => r.id)),
  ]);
  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  const ratingsByEntry = groupRatingsByEntry(ratings);
  return rows.map((row) => attachRecipeAndCompat(row, recipesById, members, ratingsByEntry));
}

export async function fetchPlanEntriesInRange(from: string, to: string): Promise<PlanEntryWithDetails[]> {
  const entries = await withRecipesAndMembers(async () => {
    // `ORDER BY slot` in SQL would sort alphabetically (breakfast, dinner,
    // lunch, snack) — the authoritative chronological order is applied in
    // JS afterwards via comparePlanEntries. service_date/id here are just a
    // stable pre-sort so results aren't arbitrarily ordered before that.
    const rows = await sql.query(
      `${PLAN_ENTRY_SELECT}
       WHERE pe.service_date >= $1 AND pe.service_date <= $2
       GROUP BY pe.id
       ORDER BY pe.service_date ASC, pe.position ASC, pe.id ASC`,
      [from, to]
    );
    return rows as PlanEntryRow[];
  });
  return entries.sort(comparePlanEntries);
}

export async function fetchPlanEntryById(id: number): Promise<PlanEntryWithDetails | null> {
  const [rows, recipes, members, ratings] = await Promise.all([
    sql.query(`${PLAN_ENTRY_SELECT} WHERE pe.id = $1 GROUP BY pe.id`, [id]),
    fetchAllRecipes(),
    fetchMembersForCompat(),
    fetchRatingsForEntryIds([id]),
  ]);
  const row = (rows as PlanEntryRow[])[0];
  if (!row) return null;
  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  const ratingsByEntry = groupRatingsByEntry(ratings);
  return attachRecipeAndCompat(row, recipesById, members, ratingsByEntry);
}

export async function fetchPlanHistory(limit: number): Promise<PlanEntryWithDetails[]> {
  // Same alphabetical-slot caveat as fetchPlanEntriesInRange — the
  // authoritative order (newest date first, chronological slot within a
  // day) is applied in JS via comparePlanEntriesForHistory.
  const entries = await withRecipesAndMembers(async () => {
    const rows = await sql.query(
      `${PLAN_ENTRY_SELECT}
       WHERE pe.status = 'plated'
       GROUP BY pe.id
       ORDER BY pe.service_date DESC, pe.position ASC, pe.id DESC
       LIMIT $1`,
      [limit]
    );
    return rows as PlanEntryRow[];
  });
  return entries.sort(comparePlanEntriesForHistory);
}

export async function fetchAllMemberIds(): Promise<number[]> {
  const rows = await sql`SELECT id FROM fm_members ORDER BY sort_order ASC, id ASC`;
  return (rows as { id: number }[]).map((r) => r.id);
}

// The engine's own HistoryEntry shape — a lighter read than
// PlanEntryWithDetails (no attendees/compat, since the engine never needs
// them for variety/protein reasoning), with each entry's primary protein
// precomputed here (in the DB layer, where the full ingredient list is
// available) so the engine itself stays pure and never has to look a
// recipe up by id. Used by /api/suggest and /api/plan/fill.
export async function fetchHistoryForEngine(from: string, to: string): Promise<HistoryEntry[]> {
  const rows = await sql.query(
    `SELECT service_date::text AS service_date, slot, recipe_id, custom_name, status
     FROM fm_plan_entries
     WHERE service_date >= $1 AND service_date <= $2`,
    [from, to]
  );
  const recipes = await fetchAllRecipes();
  const recipesById = new Map(recipes.map((r) => [r.id, r]));

  return (
    rows as { service_date: string; slot: MealType; recipe_id: number | null; custom_name: string | null; status: PlanStatus }[]
  ).map((row) => {
    if (row.recipe_id === null) {
      return {
        serviceDate: row.service_date,
        slot: row.slot,
        status: row.status,
        recipeId: null,
        recipeName: row.custom_name ?? '',
        protein: null,
      };
    }
    const recipe = recipesById.get(row.recipe_id);
    if (!recipe) {
      // Defensive only — see attachRecipeAndCompat's identical comment.
      return { serviceDate: row.service_date, slot: row.slot, status: row.status, recipeId: row.recipe_id, recipeName: '', protein: null };
    }
    return {
      serviceDate: row.service_date,
      slot: row.slot,
      status: row.status,
      recipeId: recipe.id,
      recipeName: recipe.name,
      protein: primaryProtein(recipe.ingredients),
    };
  });
}
