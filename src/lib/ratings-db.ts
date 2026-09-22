import { sql } from './db';
import type { Verdict } from './vocab';
import type { EngineRating } from './engine/score';

export interface RatingRow {
  id: number;
  recipe_id: number;
  member_id: number;
  entry_id: number | null;
  verdict: Verdict;
  note: string | null;
  rated_at: string;
}

const RATING_SELECT = 'SELECT id, recipe_id, member_id, entry_id, verdict, note, rated_at::text AS rated_at FROM fm_ratings';

export async function fetchRatingsByRecipe(recipeId: number): Promise<RatingRow[]> {
  const rows = await sql.query(`${RATING_SELECT} WHERE recipe_id = $1 ORDER BY rated_at DESC`, [recipeId]);
  return rows as RatingRow[];
}

export async function fetchRatingsForEntryIds(entryIds: number[]): Promise<RatingRow[]> {
  if (entryIds.length === 0) return [];
  const rows = await sql.query(`${RATING_SELECT} WHERE entry_id = ANY($1::int[]) ORDER BY rated_at DESC`, [entryIds]);
  return rows as RatingRow[];
}

// The household's whole rating history is small (one row per member per
// plated dish), so the engine's callers (/api/suggest, /api/plan/fill) just
// load the lot and let the pure engine filter by recipe/member — same
// "fetch the whole table, filter in JS" approach recipes-db.ts and
// plan-db.ts already use.
export async function fetchAllRatings(): Promise<RatingRow[]> {
  const rows = await sql.query(`${RATING_SELECT} ORDER BY rated_at DESC`);
  return rows as RatingRow[];
}

/** RatingRow (snake_case DB shape) -> EngineRating (camelCase, what score.ts/fill.ts take). */
export function toEngineRatings(rows: RatingRow[]): EngineRating[] {
  return rows.map((r) => ({ recipeId: r.recipe_id, memberId: r.member_id, verdict: r.verdict, ratedAt: r.rated_at }));
}

export interface CleanPlate {
  recipeId: number;
  recipeName: string;
}

/**
 * The Table's "CLEAN PLATES" row: up to 3 recipes per member with the most
 * `clean` verdicts, ties broken by most recent. Not in the slice spec's
 * literal API list (which only names GET ?recipe_id=) — see
 * docs/slices/03-engine.md Build notes.
 */
export async function fetchCleanPlatesByMember(): Promise<Map<number, CleanPlate[]>> {
  const rows = await sql`
    SELECT r.member_id, r.recipe_id, rec.name AS recipe_name, COUNT(*)::int AS clean_count, MAX(r.rated_at) AS last_rated
    FROM fm_ratings r
    JOIN fm_recipes rec ON rec.id = r.recipe_id
    WHERE r.verdict = 'clean'
    GROUP BY r.member_id, r.recipe_id, rec.name
    ORDER BY r.member_id ASC, clean_count DESC, last_rated DESC
  `;
  const map = new Map<number, CleanPlate[]>();
  for (const row of rows as { member_id: number; recipe_id: number; recipe_name: string }[]) {
    const list = map.get(row.member_id) ?? [];
    if (list.length < 3) {
      list.push({ recipeId: row.recipe_id, recipeName: row.recipe_name });
      map.set(row.member_id, list);
    }
  }
  return map;
}
