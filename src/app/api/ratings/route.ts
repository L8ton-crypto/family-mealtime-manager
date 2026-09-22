import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { checkRatingEligibility, putRatingSchema } from '@/lib/ratings-schema';
import { fetchRatingsByRecipe, fetchRatingsForEntryIds } from '@/lib/ratings-db';

function parsePositiveInt(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// GET /api/ratings?recipe_id=<id>  — every rating for a dish, newest first.
// GET /api/ratings?entry_id=<id>   — every rating for one plan entry (used
// by Plate check to show saved verdicts when reopened). Not in the slice
// spec's literal API list, but required by its own acceptance criterion
// ("reopening shows them") — see docs/slices/03-engine.md Build notes.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const recipeId = parsePositiveInt(params.get('recipe_id'));
  const entryId = parsePositiveInt(params.get('entry_id'));

  if (recipeId !== null) {
    return NextResponse.json(await fetchRatingsByRecipe(recipeId));
  }
  if (entryId !== null) {
    return NextResponse.json(await fetchRatingsForEntryIds([entryId]));
  }
  return NextResponse.json(
    { error: 'validation', issues: [{ message: 'recipe_id or entry_id is required' }] },
    { status: 400 }
  );
}

// PUT /api/ratings — upsert one (entry_id, member_id) verdict. The dish
// being rated is always the entry's OWN recipe_id (fm_ratings.recipe_id is
// not null), never trusted from the client, so a plated custom entry
// ("Takeaway") — which has no recipe — can't be rated at all.
export async function PUT(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = putRatingSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation', issues: parsed.error.issues }, { status: 400 });
  }
  const { entry_id, member_id, verdict, note } = parsed.data;

  const [entry] = await sql`SELECT id, recipe_id, status FROM fm_plan_entries WHERE id = ${entry_id}`;
  if (!entry) {
    return NextResponse.json({ error: 'validation', issues: [{ message: 'entry_id does not exist' }] }, { status: 400 });
  }

  const [member] = await sql`SELECT id FROM fm_members WHERE id = ${member_id}`;
  if (!member) {
    return NextResponse.json({ error: 'validation', issues: [{ message: 'member_id does not exist' }] }, { status: 400 });
  }

  // QA (Slice 3, second pass): a rating can only be logged for a member who
  // actually attended, and only once the service has been plated — see
  // checkRatingEligibility's own doc comment.
  const attendeeRows = await sql`SELECT member_id FROM fm_plan_entry_attendees WHERE entry_id = ${entry_id}`;
  const attendeeIds = (attendeeRows as { member_id: number }[]).map((r) => r.member_id);
  const eligibility = checkRatingEligibility({
    entryRecipeId: entry.recipe_id,
    entryStatus: entry.status,
    entryAttendeeIds: attendeeIds,
    memberId: member_id,
  });
  if (!eligibility.ok) {
    return NextResponse.json({ error: 'validation', issues: [{ message: eligibility.message }] }, { status: 400 });
  }

  const [rating] = await sql`
    INSERT INTO fm_ratings (recipe_id, member_id, entry_id, verdict, note)
    VALUES (${entry.recipe_id}, ${member_id}, ${entry_id}, ${verdict}, ${note})
    ON CONFLICT (entry_id, member_id)
    DO UPDATE SET verdict = EXCLUDED.verdict, note = EXCLUDED.note, rated_at = now()
    RETURNING id, recipe_id, member_id, entry_id, verdict, note, rated_at::text AS rated_at
  `;

  return NextResponse.json(rating);
}
