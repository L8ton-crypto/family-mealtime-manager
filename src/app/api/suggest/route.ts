import { NextRequest, NextResponse } from 'next/server';
import { fetchAllRecipes, toEngineRecipe } from '@/lib/recipes-db';
import { fetchAllMembersForEngine } from '@/lib/members-db';
import { fetchHistoryForEngine } from '@/lib/plan-db';
import { fetchAllRatings, toEngineRatings } from '@/lib/ratings-db';
import { deriveAllergens } from '@/lib/recipes';
import { scoreRecipe, type EngineRecipe, type ScoreResult } from '@/lib/engine/score';
import { addDays, isValidISODate, startOfWeek } from '@/lib/dates';
import { MEAL_TYPES, type MealType } from '@/lib/vocab';

// GET /api/suggest?date=&slot=&attendees=1,2&limit=6 — ranked suggestions
// for one service, with a plain-English reason list per dish. See
// docs/slices/03-engine.md.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const date = params.get('date');
  const slot = params.get('slot');
  const attendeesParam = params.get('attendees');
  const limitParam = params.get('limit');
  const seedParam = params.get('seed');

  if (!date || !isValidISODate(date)) {
    return NextResponse.json(
      { error: 'validation', issues: [{ message: 'date is required, as a real YYYY-MM-DD calendar date' }] },
      { status: 400 }
    );
  }
  if (!slot || !MEAL_TYPES.includes(slot as MealType)) {
    return NextResponse.json(
      { error: 'validation', issues: [{ message: `slot must be one of ${MEAL_TYPES.join(', ')}` }] },
      { status: 400 }
    );
  }

  let limit = 6;
  if (limitParam !== null) {
    limit = Number(limitParam);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      return NextResponse.json(
        { error: 'validation', issues: [{ message: 'limit must be an integer between 1 and 50' }] },
        { status: 400 }
      );
    }
  }

  const [recipeRows, allMembers] = await Promise.all([fetchAllRecipes(), fetchAllMembersForEngine()]);

  let attendeeIds: number[];
  if (attendeesParam !== null && attendeesParam.trim() !== '') {
    attendeeIds = attendeesParam.split(',').map(Number);
    if (attendeeIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      return NextResponse.json(
        { error: 'validation', issues: [{ message: 'attendees must be a comma-separated list of member ids' }] },
        { status: 400 }
      );
    }
  } else {
    attendeeIds = allMembers.map((m) => m.id);
  }
  const attendees = allMembers.filter((m) => attendeeIds.includes(m.id));

  // Last 21 days plus the week being planned, per docs/slices/03-engine.md —
  // so a dish already on a different day of the SAME week the caller is
  // looking at also counts towards the variety/protein checks.
  const historyFrom = addDays(date, -21);
  const historyTo = addDays(startOfWeek(date), 6);
  const [history, ratingRows] = await Promise.all([fetchHistoryForEngine(historyFrom, historyTo), fetchAllRatings()]);
  const ratings = toEngineRatings(ratingRows);

  // No seed supplied -> deterministic per date+slot (so refreshing the
  // picker mid-session doesn't reshuffle results), rather than a fresh
  // random seed on every request.
  const seed = seedParam ?? `${date}:${slot}`;

  const scored = recipeRows
    .map(toEngineRecipe)
    .map((recipe) => ({
      recipe,
      result: scoreRecipe(recipe, { date, slot: slot as MealType, attendees, history, ratings, seed }),
    }))
    .filter((x): x is { recipe: EngineRecipe; result: ScoreResult } => x.result !== null)
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, limit);

  return NextResponse.json(
    scored.map(({ recipe, result }) => ({
      recipe: {
        id: recipe.id,
        name: recipe.name,
        totalMinutes: recipe.prepMinutes + recipe.cookMinutes,
        allergens: deriveAllergens(recipe.ingredients),
        mealTypes: recipe.mealTypes,
      },
      score: result.score,
      headline: result.reasons[0]?.text ?? '',
      reasons: result.reasons,
    }))
  );
}
