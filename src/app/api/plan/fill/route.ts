import { NextRequest, NextResponse } from 'next/server';
import { fillPlanSchema } from '@/lib/plan-schema';
import { fetchAllRecipes, toEngineRecipe } from '@/lib/recipes-db';
import { fetchAllMembersForEngine } from '@/lib/members-db';
import { fetchHistoryForEngine, fetchPlanEntriesInRange } from '@/lib/plan-db';
import { fetchAllRatings, toEngineRatings } from '@/lib/ratings-db';
import { fillWeek, type ExistingSlotEntry } from '@/lib/engine/fill';
import { addDays, startOfWeek, weekDays } from '@/lib/dates';
import { MEAL_TYPES, type MealType } from '@/lib/vocab';

// POST /api/plan/fill — "Fire the week". Proposes dishes for a week's
// services WITHOUT saving anything; the client reviews (and can Swap) the
// proposals, then commits them via POST /api/plan/batch. See
// docs/slices/03-engine.md.
export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = fillPlanSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation', issues: parsed.error.issues }, { status: 400 });
  }
  const { week, today, slots, attendees, keepExisting, seed } = parsed.data;

  const weekStart = startOfWeek(week);
  const days = weekDays(weekStart);
  const weekEnd = days[6];
  const orderedSlots = [...slots].sort((a, b) => MEAL_TYPES.indexOf(a) - MEAL_TYPES.indexOf(b));

  const [recipeRows, allMembers] = await Promise.all([fetchAllRecipes(), fetchAllMembersForEngine()]);

  let attendeesByDefault: number[];
  if (attendees !== undefined) {
    const knownIds = new Set(allMembers.map((m) => m.id));
    if (attendees.some((id) => !knownIds.has(id))) {
      return NextResponse.json(
        { error: 'validation', issues: [{ message: 'One or more attendee ids do not exist' }] },
        { status: 400 }
      );
    }
    attendeesByDefault = attendees;
  } else {
    attendeesByDefault = allMembers.map((m) => m.id);
  }

  // Last 21 days before the week PLUS the week itself (which also captures
  // any pre-existing entries in the week, whether or not keepExisting keeps
  // them — see plan-db.ts's fetchHistoryForEngine doc comment and
  // docs/slices/03-engine.md's Build notes).
  const historyFrom = addDays(weekStart, -21);
  const [history, ratingRows, existingEntries] = await Promise.all([
    fetchHistoryForEngine(historyFrom, weekEnd),
    fetchAllRatings(),
    fetchPlanEntriesInRange(weekStart, weekEnd),
  ]);

  const existing: ExistingSlotEntry[] = existingEntries
    .filter((e) => (orderedSlots as MealType[]).includes(e.slot))
    .map((e) => ({
      day: e.service_date,
      slot: e.slot,
      entryId: e.id,
      name: e.recipe ? e.recipe.name : (e.custom_name ?? 'Untitled'),
      status: e.status,
    }));

  const proposals = fillWeek({
    days,
    slots: orderedSlots,
    recipes: recipeRows.map(toEngineRecipe),
    members: allMembers,
    attendeesByDefault,
    history,
    ratings: toEngineRatings(ratingRows),
    seed: seed ?? weekStart,
    keepExisting,
    existing,
    today,
  });

  return NextResponse.json({ proposals });
}
